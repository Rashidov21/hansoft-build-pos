"""Vozvrat: sotilgan / qaytgan / qoldiq qty — qidiruv va return-lines uchun umumiy hisob."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any
from uuid import UUID

from core.qty import parse_qty
from inventory.models import InventoryMovement

from .models import Sale, SaleLine

VOID_RESTOCK_NOTE_PREFIXES = ("Void sale restock", "Void remaining restock")


def is_void_restock_note(note: str | None) -> bool:
    n = (note or "").strip()
    return any(n.startswith(p) for p in VOID_RESTOCK_NOTE_PREFIXES)


def _sold_and_returned_maps(
    all_lines: list[SaleLine],
    sale: Sale,
    *,
    include_bonus: bool = True,
) -> tuple[dict[str, Decimal], dict[str, Decimal], dict[str, Decimal], dict[str, SaleLine]]:
    sold_by_variant: dict[str, Decimal] = {}
    line_total_by_vid: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    first_line_by_vid: dict[str, SaleLine] = {}
    for ln in all_lines:
        if not include_bonus and getattr(ln, "is_bonus", False):
            continue
        k = str(ln.variant_id)
        sold_by_variant[k] = sold_by_variant.get(k, Decimal("0")) + parse_qty(ln.qty)
        line_total_by_vid[k] += ln.line_total
        if k not in first_line_by_vid:
            first_line_by_vid[k] = ln

    returned_by_variant: dict[str, Decimal] = {}
    for mv in InventoryMovement.objects.filter(
        ref_sale=sale, type=InventoryMovement.Type.RETURN, reversed_at__isnull=True
    ):
        vid = str(mv.variant_id)
        delta = parse_qty(mv.qty_delta or 0)
        if delta < 0:
            delta = Decimal("0")
        returned_by_variant[vid] = returned_by_variant.get(vid, Decimal("0")) + delta

    return sold_by_variant, returned_by_variant, line_total_by_vid, first_line_by_vid


def remaining_return_units_by_sale_ids(sale_ids: list[UUID]) -> dict[str, Decimal]:
    """Har bir sale_id uchun qaytarish mumkin bo‘lgan jami miqdor (bonuslar hisobga olinmaydi)."""
    if not sale_ids:
        return {}
    sold: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: Decimal("0")))
    for ln in SaleLine.objects.filter(sale_id__in=sale_ids, is_bonus=False).values(
        "sale_id", "variant_id", "qty"
    ):
        sold[str(ln["sale_id"])][str(ln["variant_id"])] += parse_qty(ln["qty"])

    returned: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: Decimal("0")))
    for mv in InventoryMovement.objects.filter(
        ref_sale_id__in=sale_ids,
        type=InventoryMovement.Type.RETURN,
        reversed_at__isnull=True,
    ).values("ref_sale_id", "variant_id", "qty_delta"):
        delta = parse_qty(mv["qty_delta"] or 0)
        if delta < 0:
            delta = Decimal("0")
        returned[str(mv["ref_sale_id"])][str(mv["variant_id"])] += delta

    out: dict[str, Decimal] = {}
    for sid in sale_ids:
        sid_s = str(sid)
        total = Decimal("0")
        for vid, sq in sold[sid_s].items():
            rem = sq - returned[sid_s].get(vid, Decimal("0"))
            if rem > 0:
                total += rem
        out[sid_s] = total
    return out


def sale_return_state(*, has_sale_lines: bool, total_remaining) -> str:
    if not has_sale_lines:
        return "no_lines"
    if Decimal(str(total_remaining or 0)) <= 0:
        return "fully_returned"
    return "returnable"


def build_return_eligible_lines(sale: Sale, all_lines: list[SaleLine] | None = None) -> tuple[list[dict[str, Any]], str, Decimal]:
    """Qaytarish formasi qatorlari + holat. Bonus qatorlari chiqarilmaydi."""
    all_lines = all_lines if all_lines is not None else list(sale.lines.all())
    non_bonus = [ln for ln in all_lines if not getattr(ln, "is_bonus", False)]
    if not non_bonus:
        has_any = bool(all_lines)
        return [], sale_return_state(has_sale_lines=has_any, total_remaining=0), Decimal("0")

    sold_by_variant, returned_by_variant, line_total_by_vid, first_line_by_vid = _sold_and_returned_maps(
        all_lines, sale, include_bonus=False
    )

    rows: list[dict[str, Any]] = []
    total_remaining = Decimal("0")
    for vid, sq in sorted(sold_by_variant.items(), key=lambda x: x[0]):
        rq = returned_by_variant.get(vid, Decimal("0"))
        rem = sq - rq
        if rem <= 0:
            continue
        total_remaining += rem
        line = first_line_by_vid.get(vid)
        if not line:
            continue
        v = line.variant
        prod = v.product
        cat = getattr(prod, "category", None)
        rows.append(
            {
                "variant_id": vid,
                "barcode": v.barcode or "",
                "product_name_uz": getattr(prod, "name_uz", "") or "",
                "product_name_ru": getattr(prod, "name_ru", "") or "",
                "product_name_uz_cyrillic": getattr(prod, "name_uz_cyrillic", None),
                "product_custom_name_uz": getattr(prod, "custom_name_uz", None),
                "product_custom_name_ru": getattr(prod, "custom_name_ru", None),
                "product_custom_name_uz_cyrillic": getattr(prod, "custom_name_uz_cyrillic", None),
                "category_name_uz": getattr(cat, "name_uz", "") if cat else "",
                "category_name_ru": getattr(cat, "name_ru", "") if cat else "",
                "color": getattr(v, "color", "") or "",
                "unit": getattr(v, "unit", "kg") or "kg",
                "sold_qty": str(sq),
                "returned_qty": str(rq),
                "remaining_qty": str(rem),
                "unit_price": str(line.net_unit_price),
                "line_total": str(line_total_by_vid.get(vid, Decimal("0"))),
                "stock_qty": str(v.stock_qty or 0),
                "is_bonus": False,
            }
        )

    state = sale_return_state(has_sale_lines=True, total_remaining=total_remaining)
    return rows, state, total_remaining


def remaining_return_line_payloads(
    sale: Sale, all_lines: list[SaleLine] | None = None, *, include_bonus: bool = False
) -> list[dict[str, Any]]:
    """Void/return uchun qolgan qty payloadlari."""
    all_lines = all_lines if all_lines is not None else list(sale.lines.all())
    sold_by_variant, returned_by_variant, _, _ = _sold_and_returned_maps(
        all_lines, sale, include_bonus=include_bonus
    )
    out: list[dict[str, Any]] = []
    for vid, sq in sold_by_variant.items():
        rem = sq - returned_by_variant.get(vid, Decimal("0"))
        if rem > 0:
            out.append({"variant_id": vid, "qty": rem})
    return out
