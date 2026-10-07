"""Offline lifetime activation keys (no license server required)."""

from __future__ import annotations

import json
from typing import Any

from django.conf import settings

LIFETIME_EXPIRY_ISO = "2099-12-31T23:59:59"


def _normalize_key(key: str) -> str:
    return (key or "").strip().lower()


def offline_lifetime_keys() -> frozenset[str]:
    raw = getattr(settings, "OFFLINE_LIFETIME_ACTIVATION_KEYS", None)
    if raw is None:
        return frozenset()
    if isinstance(raw, str):
        parts = raw.split(",")
    else:
        parts = list(raw)
    return frozenset(_normalize_key(p) for p in parts if _normalize_key(p))


def is_offline_lifetime_key(activation_key: str) -> bool:
    k = _normalize_key(activation_key)
    if not k:
        return False
    allowed = offline_lifetime_keys()
    return k in allowed


def offline_activation_raw_json() -> str:
    return json.dumps(
        {"mode": "offline", "license_type": "lifetime", "expires_at": LIFETIME_EXPIRY_ISO},
        ensure_ascii=False,
    )


def activation_meta_from_raw(raw_json: str) -> dict[str, Any]:
    raw = (raw_json or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}
