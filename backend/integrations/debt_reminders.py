"""Daily WhatsApp debt reminders with sale line / product details."""

from __future__ import annotations

import os
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from debt.models import Customer, Debt
from sales.models import SaleLine

from .models import IntegrationSettings
from .services import _norm_lang, _whatsapp_ready, send_whatsapp_reminder


def _pick_product_name(product, lang: str) -> str:
    selected = _norm_lang(lang)
    if selected == "ru":
        return (product.name_ru or product.name_uz or "").strip()
    cyr = getattr(product, "name_uz_cyrillic", None) or ""
    if selected == "uz-cyrl" and cyr.strip():
        return cyr.strip()
    custom = getattr(product, "custom_name_uz", None) or ""
    if custom.strip():
        return custom.strip()
    return (product.name_uz or product.name_ru or "").strip() or "-"


def sale_line_products(*, sale_id, lang: str = "uz") -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    qs = (
        SaleLine.objects.filter(sale_id=sale_id)
        .select_related("variant", "variant__product")
        .order_by("id")
    )
    for ln in qs:
        prod = ln.variant.product
        name = _pick_product_name(prod, lang)
        color = (ln.variant.color or "").strip()
        if color:
            name = f"{name} ({color})"
        rows.append(
            {
                "name": name,
                "qty": str(ln.qty),
                "unit_price": str(ln.net_unit_price),
                "line_total": str(ln.line_total),
            }
        )
    return rows


def build_debt_items_for_customer(customer: Customer, *, lang: str = "uz", limit: int = 50) -> list[dict]:
    raw_lang = (lang or "uz").lower().split(",")[0].strip()
    open_rows = (
        Debt.objects.filter(customer=customer, status=Debt.Status.OPEN)
        .select_related("originating_sale")
        .order_by("due_date", "created_at")[:limit]
    )
    items: list[dict] = []
    for d in open_rows:
        sale = d.originating_sale
        sale_no = (sale.public_sale_no or str(sale.id)[:8]) if sale else "-"
        sale_time = (
            timezone.localtime(sale.completed_at).strftime("%Y-%m-%d %H:%M")
            if sale and sale.completed_at
            else "-"
        )
        products = sale_line_products(sale_id=sale.id, lang=raw_lang) if sale else []
        items.append(
            {
                "sale_no": sale_no,
                "total_amount": str(d.total_amount),
                "remaining_amount": str(d.remaining_amount),
                "paid_now": "0",
                "sale_time": sale_time,
                "debt_created_at": timezone.localtime(d.created_at).strftime("%Y-%m-%d %H:%M"),
                "due_date": d.due_date.isoformat() if d.due_date else "-",
                "products": products,
            }
        )
    return items


def customer_open_debt_total(customer: Customer) -> Decimal:
    total = (
        Debt.objects.filter(customer=customer, status=Debt.Status.OPEN).aggregate(
            total=Sum("remaining_amount")
        )["total"]
    )
    return Decimal(str(total or "0"))


def send_debt_reminder_for_customer(*, customer: Customer, lang: str = "uz") -> dict:
    total = customer_open_debt_total(customer)
    if total <= 0:
        return {"ok": False, "skipped": True, "reason": "no_open_debt"}
    phone = (customer.phone_normalized or "").strip()
    if not phone:
        return {"ok": False, "skipped": True, "reason": "no_phone"}
    debt_items = build_debt_items_for_customer(customer, lang=lang)
    return send_whatsapp_reminder(
        phone=phone,
        customer_name=customer.name,
        amount=str(total),
        lang=lang,
        debt_items=debt_items,
        reminder_kind="debt_reminder",
    )


def send_daily_debt_reminders_to_all_customers(*, lang: str = "uz") -> dict:
    settings = IntegrationSettings.get_solo()
    if not _whatsapp_ready(settings):
        raise ValueError("WhatsApp settings are incomplete")

    customer_ids = (
        Debt.objects.filter(status=Debt.Status.OPEN)
        .values_list("customer_id", flat=True)
        .distinct()
    )
    sent = 0
    queued = 0
    failed = 0
    skipped = 0
    errors: list[dict[str, str]] = []

    for cid in customer_ids:
        try:
            customer = Customer.objects.get(pk=cid)
        except Customer.DoesNotExist:
            skipped += 1
            continue
        try:
            out = send_debt_reminder_for_customer(customer=customer, lang=lang)
        except ValueError as exc:
            failed += 1
            errors.append({"customer": customer.name, "error": str(exc)})
            continue
        if out.get("skipped"):
            skipped += 1
            continue
        if out.get("queued"):
            queued += 1
        else:
            sent += 1

    return {
        "ok": failed == 0,
        "sent": sent,
        "queued": queued,
        "failed": failed,
        "skipped": skipped,
        "errors": errors,
    }


def _debt_reminder_schedule_minutes() -> tuple[int, int, int]:
    """Return (scheduled_minutes, window_minutes_after) from AUTO_DEBT_REMINDER_TIME."""
    hhmm = (os.environ.get("AUTO_DEBT_REMINDER_TIME", "09:00") or "09:00").strip()
    try:
        hour, minute = [int(x) for x in hhmm.split(":", 1)]
    except Exception:
        hour, minute = 9, 0
    scheduled = max(0, min(23, hour)) * 60 + max(0, min(59, minute))
    # Tauri backup pings may arrive up to 2h after the configured time.
    window = int(os.environ.get("AUTO_DEBT_REMINDER_WINDOW_MINUTES", "120") or "120")
    return scheduled, max(15, window)


def run_auto_daily_debt_reminders_if_due(*, now=None, require_scheduled_time: bool = True) -> dict:
    """
    Daily scheduler hook. Sends debt reminders at most once per local day.
    Returns: {"ran": bool, "reason": str, ...}
    """
    ref_now = now or timezone.localtime()
    today = timezone.localdate()
    settings = IntegrationSettings.get_solo()
    if not settings.auto_debt_whatsapp_reminder_enabled:
        return {"ran": False, "reason": "disabled"}
    if not _whatsapp_ready(settings):
        return {"ran": False, "reason": "whatsapp_not_configured"}
    if settings.last_auto_debt_reminder_date == today:
        return {"ran": False, "reason": "already_sent"}
    if require_scheduled_time:
        scheduled, window = _debt_reminder_schedule_minutes()
        now_minutes = ref_now.hour * 60 + ref_now.minute
        if now_minutes < scheduled:
            return {"ran": False, "reason": "before_scheduled_time"}
        if now_minutes > scheduled + window:
            return {"ran": False, "reason": "after_scheduled_window"}

    open_count = Debt.objects.filter(status=Debt.Status.OPEN).values("customer_id").distinct().count()
    if open_count == 0:
        settings.last_auto_debt_reminder_date = today
        settings.save(update_fields=["last_auto_debt_reminder_date"])
        return {"ran": True, "reason": "no_open_debts"}

    out = send_daily_debt_reminders_to_all_customers(lang="uz")
    if out.get("failed", 0) > 0:
        return {"ran": False, "reason": "send_failures", "result": out}
    settings.last_auto_debt_reminder_date = today
    settings.save(update_fields=["last_auto_debt_reminder_date"])
    return {"ran": True, "reason": "sent", "result": out}
