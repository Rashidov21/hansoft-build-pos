"""Postavshikdan tovar qabul qilish — stock + ixtiyoriy PURCHASE."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Sum

from core.qty import parse_qty
from inventory.models import InventoryMovement
from inventory.services import apply_movement

from .models import (
    ProductVariant,
    Supplier,
    SupplierReceipt,
    SupplierReceiptLine,
    SupplierTransaction,
)

QUANT = Decimal("1")


def _q(d: Decimal) -> Decimal:
    return d.quantize(QUANT, rounding=ROUND_HALF_UP)


@transaction.atomic
def create_supplier_receipt(
    *,
    supplier_id: str,
    lines: list[dict[str, Any]],
    user: User | None,
    note: str = "",
    create_purchase_debt: bool = True,
) -> SupplierReceipt:
    """
    lines: [{ variant_id, qty, unit_cost }]
    Katalogda mavjud variantlar tanlanadi.
    """
    supplier = Supplier.objects.select_for_update().get(pk=supplier_id, is_active=True)
    if not lines:
        raise ValueError("At least one receipt line required")

    parsed: list[dict[str, Any]] = []
    total = Decimal("0")
    for raw in lines:
        vid = raw["variant_id"]
        qty = parse_qty(raw["qty"])
        if qty <= 0:
            raise ValueError("Invalid qty")
        unit_cost = _q(Decimal(str(raw["unit_cost"])))
        if unit_cost < 0:
            raise ValueError("unit_cost cannot be negative")
        v = ProductVariant.objects.select_for_update().filter(
            pk=vid, deleted_at__isnull=True, is_active=True
        ).first()
        if not v:
            raise ValueError(f"Variant not found: {vid}")
        line_cost = _q(unit_cost * Decimal(qty))
        total += line_cost
        parsed.append(
            {
                "variant": v,
                "qty": qty,
                "unit_cost": unit_cost,
                "line_cost": line_cost,
            }
        )

    receipt = SupplierReceipt.objects.create(
        supplier=supplier,
        note=note or "",
        total_cost=_q(total),
        recorded_by=user,
    )

    for pl in parsed:
        SupplierReceiptLine.objects.create(
            receipt=receipt,
            variant=pl["variant"],
            qty=pl["qty"],
            unit_cost=pl["unit_cost"],
            line_cost=pl["line_cost"],
        )
        apply_movement(
            variant=pl["variant"],
            qty_delta=pl["qty"],
            movement_type=InventoryMovement.Type.IN,
            user=user,
            note=f"Supplier receipt {receipt.id}",
        )
        v = pl["variant"]
        v.purchase_price = pl["unit_cost"]
        v.save(update_fields=["purchase_price", "updated_at"])

    if create_purchase_debt and total > 0:
        tx = SupplierTransaction.objects.create(
            supplier=supplier,
            type=SupplierTransaction.Type.PURCHASE,
            amount=_q(total),
            description_uz=f"Tovar qabul #{str(receipt.id)[:8]}",
            description_ru=f"Приём товара #{str(receipt.id)[:8]}",
            note=note or "",
            recorded_by=user,
        )
        receipt.linked_transaction = tx
        receipt.save(update_fields=["linked_transaction"])

    return receipt


def supplier_receipt_profit(*, supplier_id: str) -> dict[str, Any]:
    """Shu postavshikdan kelgan tovarlarning qabul tannarxi (sotuv foydasi alohida hisoblanmaydi)."""
    receipt_ids = SupplierReceipt.objects.filter(supplier_id=supplier_id).values_list(
        "id", flat=True
    )
    lines = SupplierReceiptLine.objects.filter(receipt_id__in=receipt_ids)
    received_cost = lines.aggregate(t=Sum("line_cost"))["t"] or Decimal("0")

    return {
        "received_cost": str(_q(Decimal(str(received_cost)))),
        "sold_count": 0,
        "sold_revenue": "0",
        "sold_cogs": "0",
        "profit": "0",
    }
