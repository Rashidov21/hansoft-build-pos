from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from .models import IntegrationSettings, NotificationQueue

MAX_ATTEMPTS = 10


def _sync_event_type(kind: str) -> str:
    if kind in (
        NotificationQueue.Kind.Z_REPORT_TELEGRAM,
        NotificationQueue.Kind.Z_REPORT_WHATSAPP,
    ):
        return "z_report_sync"
    if kind == NotificationQueue.Kind.WHATSAPP_DEBT_REMINDER:
        return "debt_reminder_sync"
    return "integration_sync"


def enqueue(kind: str, payload: dict[str, Any]) -> NotificationQueue:
    return NotificationQueue.objects.create(
        kind=kind,
        payload=payload,
        status=NotificationQueue.Status.PENDING,
    )


def flush_pending(*, limit: int = 50) -> dict[str, Any]:
    """Send pending notifications; return counts."""
    sent = 0
    failed = 0
    skipped = 0

    for _ in range(limit):
        with transaction.atomic():
            row = (
                NotificationQueue.objects.select_for_update()
                .filter(status=NotificationQueue.Status.PENDING)
                .order_by("created_at")
                .first()
            )
            if row is None:
                break
            row.attempts += 1
            if row.attempts > MAX_ATTEMPTS:
                row.status = NotificationQueue.Status.FAILED
                row.last_error = "max attempts exceeded"
                row.save(update_fields=["attempts", "status", "last_error"])
                failed += 1
                continue
            row.save(update_fields=["attempts"])

        from .services import (
            _send_telegram_text,
            _send_whatsapp_debt_reminder_now,
            _send_whatsapp_text,
        )

        settings = IntegrationSettings.get_solo()
        try:
            if row.kind == NotificationQueue.Kind.Z_REPORT_TELEGRAM:
                text = str(row.payload.get("text") or "")
                _send_telegram_text(settings=settings, text=text)
            elif row.kind == NotificationQueue.Kind.Z_REPORT_WHATSAPP:
                text = str(row.payload.get("text") or "")
                _send_whatsapp_text(settings=settings, text=text)
            elif row.kind == NotificationQueue.Kind.WHATSAPP_DEBT_REMINDER:
                _send_whatsapp_debt_reminder_now(
                    settings=settings,
                    phone=str(row.payload.get("phone") or ""),
                    customer_name=str(row.payload.get("customer_name") or ""),
                    amount=str(row.payload.get("amount") or "0"),
                    lang=str(row.payload.get("lang") or "uz"),
                    debt_items=list(row.payload.get("debt_items") or []),
                    reminder_kind=str(row.payload.get("reminder_kind") or "debt_reminder"),
                    payment_amount=str(row.payload.get("payment_amount") or "0"),
                    payment_time=str(row.payload.get("payment_time") or "-"),
                    is_partial=bool(row.payload.get("is_partial") or False),
                    total_remaining=str(row.payload.get("total_remaining") or "0"),
                    store_name=str(row.payload.get("store_name") or ""),
                    store_phone=str(row.payload.get("store_phone") or ""),
                )
            else:
                raise ValueError(f"Unknown queue kind: {row.kind}")
        except ValueError as e:
            row.status = NotificationQueue.Status.PENDING
            row.last_error = str(e)[:500]
            row.save(update_fields=["status", "last_error"])
            skipped += 1
            continue

        # Best-effort sync-report to owner dashboard for offline event traceability.
        try:
            from licensing.models import LicenseState
            from licensing.remote_client import remote_sync_report

            lic = LicenseState.get_solo()
            key = (lic.license_key or "").strip()
            hw = (lic.hardware_id or "").strip()
            if key and hw:
                event = {
                    "client_event_id": str(row.id),
                    "event_type": _sync_event_type(str(row.kind)),
                    "payload": row.payload,
                    "client_timestamp": timezone.now().isoformat(),
                    "device_info": "POS-Windows",
                }
                remote_sync_report(activation_key=key, hardware_id=hw, events=[event])
        except Exception:
            # Do not block core notification delivery if sync-report is unavailable.
            pass

        row.status = NotificationQueue.Status.SENT
        row.sent_at = timezone.now()
        row.last_error = ""
        row.save(update_fields=["status", "sent_at", "last_error"])
        sent += 1

    return {"sent": sent, "failed": failed, "skipped": skipped, "processed_cap": limit}
