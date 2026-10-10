"""Savdo tarixi: vozvrat holati va void mumkinligi (batch)."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum

from core.qty import parse_qty

from .models import Sale, SaleLine, SaleRefund
from .refund_utils import _grand_total_scale
from .return_state import remaining_return_units_by_sale_ids

QUANT = Decimal("1")


def _q_money(value) -> str:
    return str(Decimal(str(value or 0)).quantize(QUANT, rounding=ROUND_HALF_UP))


def build_history_return_meta(sales: list[Sale]) -> dict[str, dict]:
    if not sales:
        return {}
    sale_ids = [s.id for s in sales]
    remaining_by_sale = remaining_return_units_by_sale_ids(sale_ids)
    # Bonus qatorlar vozvrat hisobidan chiqariladi — sold ham shu qoida bilan.
    sold_units: dict[str, Decimal] = {}
    for row in (
        SaleLine.objects.filter(sale_id__in=sale_ids, is_bonus=False)
        .values("sale_id")
        .annotate(t=Sum("qty"))
    ):
        sold_units[str(row["sale_id"])] = parse_qty(row["t"] or 0)

    refund_by_sale: dict[str, Decimal] = {}
    for row in (
        SaleRefund.objects.filter(sale_id__in=sale_ids, reversed_at__isnull=True)
        .values("sale_id")
        .annotate(t=Sum("amount"))
    ):
        refund_by_sale[str(row["sale_id"])] = Decimal(str(row["t"] or 0))

    out: dict[str, dict] = {}
    for sale in sales:
        sid = str(sale.id)
        sold = sold_units.get(sid, Decimal("0"))
        rem = Decimal(str(remaining_by_sale.get(sid, Decimal("0"))))
        refund_total = refund_by_sale.get(sid, Decimal("0"))

        if sold <= 0:
            return_status = "none"
        elif rem <= 0:
            return_status = "full"
        elif rem < sold:
            return_status = "partial"
        else:
            return_status = "none"

        can_void = sale.status == Sale.Status.COMPLETED and rem > 0

        out[sid] = {
            "return_status": return_status,
            "refund_total": _q_money(refund_total),
            "can_void": can_void,
        }
    return out


def build_history_lines_meta(sales: list[Sale]) -> dict[str, list[dict]]:
    """Per-sale line summaries for history list (brand, model, barcode)."""
    if not sales:
        return {}
    sale_ids = [s.id for s in sales]
    by_sale: dict[str, list[dict]] = {}
    lines = (
        SaleLine.objects.filter(sale_id__in=sale_ids)
        .select_related("variant__product__category")
        .order_by("sale_id", "id")
    )
    lines_by_sale: dict[str, list[SaleLine]] = defaultdict(list)
    for ln in lines:
        lines_by_sale[str(ln.sale_id)].append(ln)

    scale_by_sale: dict[str, Decimal] = {}
    sales_by_id = {str(s.id): s for s in sales}
    for sid, sale_lines in lines_by_sale.items():
        sale = sales_by_id.get(sid)
        if sale:
            scale_by_sale[sid] = _grand_total_scale(sale, sale_lines)

    for ln in lines:
        sid = str(ln.sale_id)
        v = ln.variant
        p = v.product
        cat = p.category
        scale = scale_by_sale.get(sid, Decimal("1"))
        scaled_total = (Decimal(str(ln.line_total or 0)) * scale).quantize(QUANT, rounding=ROUND_HALF_UP)
        qty = Decimal(str(ln.qty or 0))
        unit_price = (scaled_total / qty).quantize(QUANT, rounding=ROUND_HALF_UP) if qty > 0 else scaled_total
        by_sale.setdefault(sid, []).append(
            {
                "category_name_uz": (getattr(cat, "name_uz", None) or "") if cat else "",
                "category_name_ru": (getattr(cat, "name_ru", None) or "") if cat else "",
                "product_name_uz": (getattr(p, "name_uz", None) or "") or "",
                "product_name_ru": (getattr(p, "name_ru", None) or "") or "",
                "product_custom_name_uz": (getattr(p, "custom_name_uz", None) or "") or "",
                "product_custom_name_ru": (getattr(p, "custom_name_ru", None) or "") or "",
                "barcode": v.barcode or "",
                "qty": str(qty),
                "line_total": _q_money(scaled_total),
                "unit_price": _q_money(unit_price),
            }
        )
    return by_sale
