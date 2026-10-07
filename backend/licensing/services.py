from __future__ import annotations

from datetime import datetime, timedelta
import math
from typing import Any

from django.conf import settings
from django.utils import timezone

from .crypto import decrypt_expiry_iso, encrypt_expiry_iso
from .hardware_id import get_fallback_hardware_id
from .models import LicenseState
from .offline import activation_meta_from_raw, LIFETIME_EXPIRY_ISO, offline_activation_raw_json


def enforcement_enabled() -> bool:
    return bool(getattr(settings, "LICENSE_ENFORCEMENT", False))


def get_license_state() -> LicenseState:
    state = LicenseState.get_solo()
    changed = False
    if not state.demo_started_at:
        state.demo_started_at = timezone.now()
        changed = True
    if not (state.hardware_id or "").strip():
        state.hardware_id = get_fallback_hardware_id()[:128]
        changed = True
    if changed:
        state.save(update_fields=["demo_started_at", "hardware_id", "updated_at"])
    return state


def _demo_days_total() -> int:
    raw = getattr(settings, "LICENSE_DEMO_DAYS", 14)
    try:
        v = int(raw)
    except (TypeError, ValueError):
        v = 14
    return max(0, v)


def _demo_days_left(state: LicenseState, now: datetime | None = None) -> int:
    total = _demo_days_total()
    if total <= 0:
        return 0
    if not state.demo_started_at:
        return total
    at = now or timezone.now()
    expires = state.demo_started_at + timedelta(days=total)
    delta = (expires - at).total_seconds()
    if delta <= 0:
        return 0
    return max(0, math.ceil(delta / 86400))


def _has_active_remote_or_local_license(state: LicenseState) -> bool:
    hw = (state.hardware_id or "").strip()
    if not hw or not state.expiry_ciphertext:
        return False
    plain = decrypt_expiry_iso(hardware_id=hw, ciphertext=bytes(state.expiry_ciphertext))
    if not plain:
        return False
    expires_at = _parse_expiry_iso(plain)
    if not expires_at:
        return False
    now = timezone.now()
    if expires_at >= now:
        return True
    grace_hours = int(getattr(settings, "LICENSE_OFFLINE_GRACE_HOURS", 0) or 0)
    if grace_hours > 0 and state.last_valid_remote_at and state.last_check_ok:
        grace_end = state.last_valid_remote_at + timedelta(hours=grace_hours)
        if grace_end >= now:
            return True
    return False


def _parse_expiry_iso(iso: str) -> datetime | None:
    raw = (iso or "").strip()
    if not raw:
        return None
    if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
        raw = raw + "T23:59:59"
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def is_license_valid_for_use() -> bool:
    if not enforcement_enabled():
        return True

    state = get_license_state()
    if _has_active_remote_or_local_license(state):
        return True

    # Brand-new installations work during the demo window.
    return _demo_days_left(state) > 0


def mask_license_key(key: str) -> str:
    k = (key or "").strip()
    if len(k) <= 6:
        return "***" if k else ""
    return f"{k[:3]}…{k[-3:]}"


def apply_activation_success(
    *,
    hardware_id: str,
    license_key: str,
    expires_at_iso: str,
    raw_json: str = "",
) -> LicenseState:
    state = get_license_state()
    state.hardware_id = hardware_id.strip()[:128]
    state.license_key = license_key.strip()[:255]
    ct = encrypt_expiry_iso(hardware_id=state.hardware_id, expires_at_iso=expires_at_iso.strip())
    state.expiry_ciphertext = ct
    state.last_check_at = timezone.now()
    state.last_check_ok = True
    state.last_check_message = "ok"
    state.last_valid_remote_at = timezone.now()
    state.raw_status_json = (raw_json or "")[:4000]
    state.save()
    return state


def apply_offline_lifetime_activation(*, hardware_id: str, activation_key: str) -> LicenseState:
    return apply_activation_success(
        hardware_id=hardware_id,
        license_key=activation_key,
        expires_at_iso=LIFETIME_EXPIRY_ISO,
        raw_json=offline_activation_raw_json(),
    )


def apply_activation_failure(*, message: str) -> LicenseState:
    state = get_license_state()
    state.last_check_at = timezone.now()
    state.last_check_ok = False
    state.last_check_message = (message or "")[:500]
    state.save()
    return state


def status_dict() -> dict[str, Any]:
    if not enforcement_enabled():
        return {
            "enforcement": False,
            "valid": True,
            "license_key_masked": "",
            "expires_at": None,
            "last_check_ok": True,
            "last_check_message": "License enforcement disabled",
        }

    state = get_license_state()
    hw = (state.hardware_id or "").strip()
    masked = mask_license_key(state.license_key)
    expires_at: str | None = None
    if hw and state.expiry_ciphertext:
        plain = decrypt_expiry_iso(hardware_id=hw, ciphertext=bytes(state.expiry_ciphertext))
        if plain:
            expires_at = plain[:10] if len(plain) >= 10 else plain

    demo_total = _demo_days_total()
    demo_left = _demo_days_left(state)
    demo_expires_at = (
        (state.demo_started_at + timedelta(days=demo_total)).date().isoformat()
        if state.demo_started_at and demo_total > 0
        else None
    )

    meta = activation_meta_from_raw(state.raw_status_json)
    activation_mode = str(meta.get("mode") or "").strip().lower() or None
    license_type = str(meta.get("license_type") or "").strip().lower() or None
    if expires_at and expires_at.startswith("2099"):
        license_type = license_type or "lifetime"

    return {
        "enforcement": True,
        "valid": is_license_valid_for_use(),
        "license_key_masked": masked,
        "expires_at": expires_at,
        "last_check_ok": state.last_check_ok,
        "last_check_message": state.last_check_message,
        "hardware_id_set": bool(hw),
        "hardware_id": hw,
        "demo_days_total": demo_total,
        "demo_days_left": demo_left,
        "demo_expires_at": demo_expires_at,
        "requires_activation": not _has_active_remote_or_local_license(state),
        "activation_mode": activation_mode,
        "license_type": license_type,
        "offline_activation_available": bool(getattr(settings, "OFFLINE_LIFETIME_ACTIVATION_KEYS", [])),
    }
