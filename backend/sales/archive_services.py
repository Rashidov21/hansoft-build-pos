"""Savdo arxivlash va vozvrat bekor qilish (soft delete / reversal)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from debt.models import Debt
from inventory.models import InventoryMovement
from inventory.services import apply_movement

from .models import Sale
from .refund_utils import compute_return_amount, q_money
from .return_state import remaining_return_units_by_sale_ids


@transaction.atomic
def archive_sale(*, sale: Sale, user: User, reason: str = "") -> Sale:
    if sale.archived_at:
        return sale
    if sale.status not in (Sale.Status.COMPLETED, Sale.Status.VOIDED):
        raise ValueError("Only completed or voided sales can be archived")
    remaining = remaining_return_units_by_sale_ids([sale.id]).get(str(sale.id), 0)
    debt = getattr(sale, "debt_record", None)
    if debt and debt.status == Debt.Status.OPEN and Decimal(str(debt.remaining_amount or 0)) > 0:
        raise ValueError("Cannot archive sale with open debt")
    sale.archived_at = timezone.now()
    sale.archived_by = user
    note = (reason or "").strip()
    if note:
        sale.note = f"{sale.note}\nARCHIVED: {note}".strip()
    sale.save(update_fields=["archived_at", "archived_by", "note"])
    return sale


@transaction.atomic
def reverse_return_movement(*, movement_id: str, user: User, reason: str = "") -> dict[str, Any]:
    try:
        mv = InventoryMovement.objects.select_related("ref_sale", "variant").get(pk=movement_id)
    except InventoryMovement.DoesNotExist:
        raise ValueError("Return movement not found")
    if mv.type != InventoryMovement.Type.RETURN:
        raise ValueError("Movement is not a return")
    if mv.reversed_at:
        raise ValueError("Return already reversed")
    if not mv.ref_sale_id:
        raise ValueError("Return is not linked to a sale")
    sale = mv.ref_sale
    if sale.status != Sale.Status.COMPLETED:
        raise ValueError("Sale is not completed")
    if (mv.note or "").startswith("Void "):
        raise ValueError("Cannot reverse void restock movement")

    from core.qty import parse_qty

    qty = parse_qty(mv.qty_delta or 0)
    if qty <= 0:
        raise ValueError("Invalid return quantity")

    variant = mv.variant
    apply_movement(
        variant=variant,
        qty_delta=-qty,
        movement_type=InventoryMovement.Type.OUT,
        user=user,
        ref_sale=sale,
        note=f"Reversed return {movement_id}. {reason}".strip(),
    )
    mv.reversed_at = timezone.now()
    mv.reversed_by = user
    mv.save(update_fields=["reversed_at", "reversed_by"])

    refund_hint = compute_return_amount(
        sale=sale,
        lines=[{"variant_id": str(variant.id), "qty": qty}],
    )
    return {
        "movement_id": str(mv.id),
        "sale_id": str(sale.id),
        "qty": qty,
        "suggested_refund_reversal": str(q_money(refund_hint)),
        "refund_manual_required": refund_hint > 0,
    }
