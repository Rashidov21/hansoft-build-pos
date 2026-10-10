from decimal import Decimal

from django.db import transaction

from core.audit import log_audit

from .models import Customer, Debt, DebtPayment, DebtPaymentAllocation


@transaction.atomic
def record_debt_payment(
    *,
    customer: Customer,
    amount: Decimal,
    user,
    method: str = DebtPayment.Method.CASH,
    card_bank: str = "",
    note: str = "",
) -> list[Debt]:
    """
    Apply payment FIFO across OPEN debts (oldest due_date, then created_at).
    Persists DebtPayment + allocations for repayment history.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")

    method_norm = (method or DebtPayment.Method.CASH).strip().upper()
    if method_norm not in {DebtPayment.Method.CASH, DebtPayment.Method.CARD}:
        raise ValueError("method must be CASH or CARD")
    bank = ""
    if method_norm == DebtPayment.Method.CARD:
        from sales.models import CardBank

        bank = (card_bank or "").strip().upper()
        valid = {c.value for c in CardBank}
        if bank not in valid:
            raise ValueError("card_bank required for CARD (MBANK, BAKAI, ZERO, EKO_ISLAMIC)")

    payment = DebtPayment.objects.create(
        customer=customer,
        amount=amount,
        method=method_norm,
        card_bank=bank,
        note=(note or "").strip()[:500],
        recorded_by=user,
    )

    remaining_pay = amount
    touched: list[Debt] = []
    qs = Debt.objects.filter(customer=customer, status=Debt.Status.OPEN).order_by(
        "due_date", "created_at"
    )
    for debt in qs:
        if remaining_pay <= 0:
            break
        pay_to = min(remaining_pay, debt.remaining_amount)
        debt.paid_amount += pay_to
        debt.remaining_amount -= pay_to
        remaining_pay -= pay_to
        if debt.remaining_amount == 0:
            debt.status = Debt.Status.PAID
        debt.save(update_fields=["paid_amount", "remaining_amount", "status", "updated_at"])
        DebtPaymentAllocation.objects.create(
            payment=payment,
            debt=debt,
            amount=pay_to,
        )
        touched.append(debt)

    if remaining_pay > 0:
        from core.exceptions import DebtPolicyError

        raise DebtPolicyError("Payment exceeds total open debt")

    log_audit(
        event_type="debt_repayment",
        actor=getattr(user, "username", None),
        entity_id=str(customer.id),
        payload={
            "payment_id": str(payment.id),
            "amount": str(amount),
            "method": method_norm,
            "touched_debt_ids": [str(d.id) for d in touched],
        },
    )

    return touched
