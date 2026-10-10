"""Resolve report destinations and deliver text/documents to ReportChannels."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .models import IntegrationSettings, NotificationQueue, ReportChannel, ReportRoute


def ensure_default_routes() -> None:
    """Create empty route rows if missing (fresh DB after migration edge cases)."""
    for report_type, _label in ReportRoute.ReportType.choices:
        ReportRoute.objects.get_or_create(report_type=report_type, defaults={"enabled": True})


def get_route_channels(report_type: str) -> list[ReportChannel]:
    ensure_default_routes()
    route = ReportRoute.objects.filter(report_type=report_type).prefetch_related("channels").first()
    if not route or not route.enabled:
        return []
    return list(route.channels.filter(is_active=True).order_by("sort_order", "name"))


def legacy_fallback_channels(report_type: str) -> list[ReportChannel]:
    """
    If no ReportChannel rows exist yet, synthesize ephemeral destinations from
    IntegrationSettings.telegram_chat_id / whatsapp_sender (not saved).
    """
    if ReportChannel.objects.exists():
        return []
    settings = IntegrationSettings.get_solo()
    primary = (settings.primary_report_channel or "both").lower()
    out: list[ReportChannel] = []
    tg = (settings.telegram_chat_id or "").strip()
    wa = (settings.whatsapp_sender or "").strip()
    if report_type == ReportRoute.ReportType.DB_BACKUP:
        if tg:
            out.append(
                ReportChannel(
                    name="Legacy Telegram",
                    kind=ReportChannel.Kind.TELEGRAM,
                    address=tg,
                    is_active=True,
                )
            )
        return out
    use_tg = primary in ("telegram", "both") and bool(tg)
    use_wa = primary in ("whatsapp", "both") and bool(wa)
    if not use_tg and not use_wa:
        use_tg, use_wa = bool(tg), bool(wa)
    if use_tg:
        out.append(
            ReportChannel(
                name="Legacy Telegram",
                kind=ReportChannel.Kind.TELEGRAM,
                address=tg,
                is_active=True,
            )
        )
    if use_wa:
        out.append(
            ReportChannel(
                name="Legacy WhatsApp",
                kind=ReportChannel.Kind.WHATSAPP,
                address=wa,
                is_active=True,
            )
        )
    return out


def resolve_channels(report_type: str) -> list[ReportChannel]:
    channels = get_route_channels(report_type)
    if channels:
        return channels
    # Routes exist but empty → try legacy only when no channels configured at all.
    if not ReportChannel.objects.exists():
        return legacy_fallback_channels(report_type)
    return []


def sync_legacy_chat_fields_from_channels() -> None:
    """Keep IntegrationSettings.telegram_chat_id / whatsapp_sender aligned with first active channels."""
    settings = IntegrationSettings.get_solo()
    tg = (
        ReportChannel.objects.filter(kind=ReportChannel.Kind.TELEGRAM, is_active=True)
        .order_by("sort_order", "name")
        .first()
    )
    wa = (
        ReportChannel.objects.filter(kind=ReportChannel.Kind.WHATSAPP, is_active=True)
        .order_by("sort_order", "name")
        .first()
    )
    updates = []
    if tg and (settings.telegram_chat_id or "") != tg.address:
        settings.telegram_chat_id = tg.address
        updates.append("telegram_chat_id")
    if wa and (settings.whatsapp_sender or "") != wa.address:
        settings.whatsapp_sender = wa.address
        updates.append("whatsapp_sender")
    if updates:
        updates.append("updated_at")
        settings.save(update_fields=updates)


def ensure_channels_from_legacy() -> None:
    """
    Upsert owner Telegram/WhatsApp ReportChannels from IntegrationSettings legacy fields
    and attach them to empty routes so existing installs keep working.
    """
    ensure_default_routes()
    settings = IntegrationSettings.get_solo()
    tg = (settings.telegram_chat_id or "").strip()
    wa = (settings.whatsapp_sender or "").strip()
    tg_ch: ReportChannel | None = None
    wa_ch: ReportChannel | None = None

    if tg:
        tg_ch = (
            ReportChannel.objects.filter(kind=ReportChannel.Kind.TELEGRAM, address=tg).first()
            or ReportChannel.objects.filter(
                kind=ReportChannel.Kind.TELEGRAM, name="Egasi (Telegram)"
            ).first()
        )
        if tg_ch:
            # Nofaol kanalni qayta yoqmang — foydalanuvchi ataylab o'chirgan bo'lishi mumkin.
            if tg_ch.is_active and tg_ch.address != tg:
                tg_ch.address = tg
                tg_ch.save(update_fields=["address", "updated_at"])
            if not tg_ch.is_active:
                tg_ch = None
        else:
            tg_ch = ReportChannel.objects.create(
                name="Egasi (Telegram)",
                kind=ReportChannel.Kind.TELEGRAM,
                address=tg,
                is_active=True,
                sort_order=0,
            )

    if wa:
        wa_ch = (
            ReportChannel.objects.filter(kind=ReportChannel.Kind.WHATSAPP, address=wa).first()
            or ReportChannel.objects.filter(
                kind=ReportChannel.Kind.WHATSAPP, name="Egasi (WhatsApp)"
            ).first()
        )
        if wa_ch:
            if wa_ch.is_active and wa_ch.address != wa:
                wa_ch.address = wa
                wa_ch.save(update_fields=["address", "updated_at"])
            if not wa_ch.is_active:
                wa_ch = None
        else:
            wa_ch = ReportChannel.objects.create(
                name="Egasi (WhatsApp)",
                kind=ReportChannel.Kind.WHATSAPP,
                address=wa,
                is_active=True,
                sort_order=1,
            )

    # Fill empty routes once both legacy destinations are known (primary preference).
    primary = (settings.primary_report_channel or "both").lower()
    owner_picked: list[ReportChannel] = []
    if tg_ch and primary in ("telegram", "both"):
        owner_picked.append(tg_ch)
    if wa_ch and primary in ("whatsapp", "both"):
        owner_picked.append(wa_ch)
    if not owner_picked:
        owner_picked = [c for c in (tg_ch, wa_ch) if c]

    z = ReportRoute.objects.filter(report_type=ReportRoute.ReportType.DAILY_Z).first()
    if z and not z.channels.exists():
        if owner_picked:
            z.channels.set(owner_picked)
        elif ReportChannel.objects.filter(is_active=True).exists():
            z.channels.set(
                list(ReportChannel.objects.filter(is_active=True).order_by("sort_order", "name"))
            )

    low = ReportRoute.objects.filter(report_type=ReportRoute.ReportType.LOW_STOCK).first()
    if low and not low.channels.exists():
        if z and z.channels.exists():
            low.channels.set(z.channels.all())
        elif owner_picked:
            low.channels.set(owner_picked)

    backup = ReportRoute.objects.filter(report_type=ReportRoute.ReportType.DB_BACKUP).first()
    if backup and not backup.channels.exists() and tg_ch:
        backup.channels.add(tg_ch)


def deliver_text_report(
    *,
    report_type: str,
    text_telegram: str,
    text_whatsapp: str,
    queue_kind_telegram: str,
    queue_kind_whatsapp: str,
    queue_payload_extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Send report text to all channels mapped for report_type."""
    from .notification_queue import enqueue
    from .services import (
        NotificationDeliveryError,
        _send_telegram_text_to,
        _send_whatsapp_text_to,
        _should_queue_after_telegram_error,
        _should_queue_after_whatsapp_error,
        _telegram_token_ready,
        _whatsapp_provider_ready,
    )

    settings = IntegrationSettings.get_solo()
    channels = resolve_channels(report_type)
    if not channels:
        raise ValueError("No report channels configured for this report type")

    channel_results: dict[str, dict[str, Any]] = {}
    extra = queue_payload_extra or {}

    for ch in channels:
        key = f"{ch.kind}:{ch.address}:{ch.name}"
        if ch.kind == ReportChannel.Kind.TELEGRAM:
            if not _telegram_token_ready(settings):
                channel_results[key] = {
                    "ok": False,
                    "details": "Telegram bot token missing",
                    "queued": False,
                }
                continue
            try:
                details = _send_telegram_text_to(
                    settings=settings, chat_id=ch.address, text=text_telegram
                )
                channel_results[key] = {"ok": True, "details": details, "queued": False}
            except (ValueError, NotificationDeliveryError) as e:
                msg = str(e)
                if _should_queue_after_telegram_error(e):
                    enqueue(
                        queue_kind_telegram,
                        {"text": text_telegram, "chat_id": ch.address, **extra},
                    )
                    channel_results[key] = {"ok": True, "details": msg, "queued": True}
                else:
                    channel_results[key] = {"ok": False, "details": msg, "queued": False}
        elif ch.kind == ReportChannel.Kind.WHATSAPP:
            if not _whatsapp_provider_ready(settings):
                channel_results[key] = {
                    "ok": False,
                    "details": "WhatsApp provider settings incomplete",
                    "queued": False,
                }
                continue
            try:
                details = _send_whatsapp_text_to(
                    settings=settings, address=ch.address, text=text_whatsapp
                )
                channel_results[key] = {"ok": True, "details": details, "queued": False}
            except (ValueError, NotificationDeliveryError) as e:
                msg = str(e)
                if _should_queue_after_whatsapp_error(e):
                    enqueue(
                        queue_kind_whatsapp,
                        {"text": text_whatsapp, "address": ch.address, **extra},
                    )
                    channel_results[key] = {"ok": True, "details": msg, "queued": True}
                else:
                    channel_results[key] = {"ok": False, "details": msg, "queued": False}

    ok = any(v.get("ok") for v in channel_results.values())
    return {
        "ok": ok,
        "details": "Sent successfully" if ok else "All channels failed",
        "channel_results": channel_results,
    }


def deliver_telegram_document_report(
    *,
    report_type: str,
    file_path: Path,
    caption: str = "",
) -> dict[str, Any]:
    from .services import NotificationDeliveryError, _send_telegram_document_to, _telegram_token_ready

    settings = IntegrationSettings.get_solo()
    if not _telegram_token_ready(settings):
        return {"ok": False, "details": "Telegram bot token missing", "channel_results": {}}

    channels = [
        c
        for c in resolve_channels(report_type)
        if c.kind == ReportChannel.Kind.TELEGRAM and c.is_active
    ]
    if not channels:
        raise ValueError("No Telegram channels configured for DB backup")

    channel_results: dict[str, dict[str, Any]] = {}
    for ch in channels:
        key = f"{ch.kind}:{ch.address}:{ch.name}"
        try:
            details = _send_telegram_document_to(
                settings=settings, chat_id=ch.address, file_path=file_path, caption=caption
            )
            channel_results[key] = {"ok": True, "details": details}
        except (ValueError, NotificationDeliveryError) as e:
            channel_results[key] = {"ok": False, "details": str(e)}

    ok = any(v.get("ok") for v in channel_results.values())
    return {
        "ok": ok,
        "details": "Sent successfully" if ok else "All channels failed",
        "channel_results": channel_results,
    }
