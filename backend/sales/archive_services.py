"""Savdo arxivlash va vozvrat bekor qilish (soft delete / reversal)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from debt.models import Debt, DebtPaymentAllocation
from inventory.models import InventoryMovement
from inventory.services import apply_movement

from .models import Sale, SaleRefund
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


def _reverse_refunds_for_amount(
    *,
    sale: Sale,
    amount: Decimal,
    user: User,
    movement_created_at,
) -> list[dict[str, str]]:
    """
    Bekor qilinayotgan vozvrat summasiga teng SaleRefund larni soft-reverse qiladi.
    DEBT refund bo'lsa — Debt.total/remaining tiklanadi.
    """
    amount = q_money(amount)
    if amount <= 0:
        return []

    debt = Debt.objects.filter(originating_sale_id=sale.pk).first()
    if debt:
        later = DebtPaymentAllocation.objects.filter(
            debt=debt, payment__created_at__gt=movement_created_at
        ).exists()
        if later:
            raise ValueError(
                "Cannot reverse return: debt payments recorded after this return"
            )

    # Shu harakat vaqtiga yaqin / undan keyin yaratilgan faol refundlar (LIFO).
    candidates = list(
        SaleRefund.objects.filter(
            sale=sale,
            reversed_at__isnull=True,
            created_at__gte=movement_created_at,
        ).order_by("-created_at", "-id")
    )
    if not candidates:
        candidates = list(
            SaleRefund.objects.filter(sale=sale, reversed_at__isnull=True).order_by(
                "-created_at", "-id"
            )
        )

    remaining = amount
    reversed_rows: list[dict[str, str]] = []
    debt_restore = Decimal("0")
    now = timezone.now()

    for rf in candidates:
        if remaining <= 0:
            break
        take = q_money(min(remaining, rf.amount))
        if take <= 0:
            continue
        if take < q_money(rf.amount):
            # Qisman: yangi reverse yozuv o'rniga to'liq soft-reverse + qoldiq refund
            leftover = q_money(rf.amount - take)
            rf.reversed_at = now
            rf.reversed_by = user
            rf.save(update_fields=["reversed_at", "reversed_by"])
            SaleRefund.objects.create(
                sale=sale,
                method=rf.method,
                amount=leftover,
                card_bank=rf.card_bank,
                created_by=rf.created_by,
                reason=f"Remainder after reverse of {rf.id}",
            )
        else:
            rf.reversed_at = now
            rf.reversed_by = user
            rf.save(update_fields=["reversed_at", "reversed_by"])

        if rf.method == SaleRefund.Method.DEBT:
            debt_restore += take
        reversed_rows.append({"method": rf.method, "amount": str(take)})
        remaining = q_money(remaining - take)

    if remaining > 0:
        raise ValueError(
            "Cannot reverse return: matching refunds not found for full amount"
        )

    if debt_restore > 0 and debt:
        debt.total_amount = q_money(debt.total_amount + debt_restore)
        debt.remaining_amount = q_money(
            max(Decimal("0"), debt.total_amount - debt.paid_amount)
        )
        if debt.remaining_amount > 0 and debt.status == Debt.Status.PAID:
            debt.status = Debt.Status.OPEN
        elif debt.remaining_amount <= 0:
            debt.remaining_amount = Decimal("0")
            debt.status = Debt.Status.PAID
        debt.save(update_fields=["total_amount", "remaining_amount", "status", "updated_at"])

    return reversed_rows


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

    refund_hint = compute_return_amount(
        sale=sale,
        lines=[{"variant_id": str(mv.variant_id), "qty": qty}],
    )
    reversed_refunds = _reverse_refunds_for_amount(
        sale=sale,
        amount=refund_hint,
        user=user,
        movement_created_at=mv.created_at,
    )

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

    return {
        "movement_id": str(mv.id),
        "sale_id": str(sale.id),
        "qty": qty,
        "suggested_refund_reversal": str(q_money(refund_hint)),
        "refunds_reversed": reversed_refunds,
        "refund_manual_required": False,
    }
