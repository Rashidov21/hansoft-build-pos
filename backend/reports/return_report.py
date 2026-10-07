"""Vozvratlar tarixi: davr bo'yicha qaytarilgan tovarlar hisoboti."""

from __future__ import annotations

from decimal import Decimal

from django.db.models import Q

from sales.models import Sale
from sales.refund_utils import compute_return_amount

from .services import _merchandise_return_movements_qs, _returned_amounts_from_movement_rows, q_money


def _movement_return_amount(*, sale: Sale, variant_id: str, qty) -> Decimal:
    if qty <= 0:
        return Decimal("0")
    return compute_return_amount(
        sale=sale,
        lines=[{"variant_id": variant_id, "qty": qty}],
    )


def return_history_summary(*, from_date: str | None = None, to_date: str | None = None, q: str = ""):
    qs = _return_history_queryset(from_date=from_date, to_date=to_date, q=q)
    movements = list(qs.values("ref_sale_id", "variant_id", "qty_delta"))
    total_raw, cogs_raw = _returned_amounts_from_movement_rows(movements)
    return {
        "return_move_count": qs.count(),
        "return_qty": float(sum(max(Decimal(str(m.qty_delta or 0)), Decimal("0")) for m in qs)),
        "return_amount_total": q_money(total_raw),
        "returned_cogs": q_money(cogs_raw),
        "distinct_sales": qs.values("ref_sale_id").distinct().count(),
    }


def _return_history_queryset(*, from_date: str | None = None, to_date: str | None = None, q: str = ""):
    qs = _merchandise_return_movements_qs().select_related(
        "ref_sale",
        "ref_sale__cashier",
        "variant__product__category",
        "user",
    )
    if from_date:
        qs = qs.filter(created_at__date__gte=from_date)
    if to_date:
        qs = qs.filter(created_at__date__lte=to_date)
    query = (q or "").strip()
    if query:
        qs = qs.filter(
            Q(ref_sale__public_sale_no__icontains=query)
            | Q(ref_sale__id__icontains=query)
            | Q(variant__barcode__icontains=query)
            | Q(variant__product__name_uz__icontains=query)
            | Q(variant__product__name_ru__icontains=query)
            | Q(variant__product__category__name_uz__icontains=query)
            | Q(variant__product__category__name_ru__icontains=query)
            | Q(note__icontains=query)
        ).distinct()
    return qs.order_by("-created_at", "-id")


def return_history_rows(*, from_date: str | None = None, to_date: str | None = None, q: str = ""):
    rows: list[dict] = []
    for mv in _return_history_queryset(from_date=from_date, to_date=to_date, q=q):
        sale = mv.ref_sale
        if not sale:
            continue
        variant = mv.variant
        product = variant.product
        category = product.category
        qty = max(Decimal(str(mv.qty_delta or 0)), Decimal("0"))
        amount = _movement_return_amount(
            sale=sale,
            variant_id=str(variant.id),
            qty=qty,
        )
        rows.append(
            {
                "id": str(mv.id),
                "movement_id": str(mv.id),
                "can_reverse": mv.reversed_at is None,
                "returned_at": mv.created_at.isoformat(),
                "sale_id": str(sale.id),
                "public_sale_no": sale.public_sale_no or "",
                "sale_completed_at": sale.completed_at.isoformat() if sale.completed_at else "",
                "cashier_username": sale.cashier.username if sale.cashier_id else "",
                "returned_by": mv.user.username if mv.user_id else "",
                "category_name_uz": getattr(category, "name_uz", "") or "",
                "category_name_ru": getattr(category, "name_ru", "") or "",
                "product_name_uz": getattr(product, "name_uz", "") or "",
                "product_name_ru": getattr(product, "name_ru", "") or "",
                "product_custom_name_uz": getattr(product, "custom_name_uz", "") or "",
                "product_custom_name_ru": getattr(product, "custom_name_ru", "") or "",
                "barcode": variant.barcode or "",
                "qty": qty,
                "return_amount": str(q_money(amount)),
                "note": (mv.note or "").strip(),
            }
        )
    return rows
