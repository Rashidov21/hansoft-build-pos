from decimal import Decimal, ROUND_HALF_UP
from typing import Any
import time

from django.contrib.auth.models import User
from django.db import IntegrityError, OperationalError, transaction

from catalog.models import ProductVariant
from core.exceptions import (
    DebtPolicyError,
    InsufficientStock,
    InvalidPaymentSplit,
)
from core.qty import parse_qty, validate_sale_qty
from debt.models import Customer, Debt
from inventory.models import InventoryMovement
from inventory.services import apply_movement
from core.audit import log_audit

from .models import Payment, Sale, SaleLine
from .return_state import remaining_return_line_payloads
from .refund_utils import (
    allocate_auto_refunds,
    apply_sale_refunds,
    compute_return_amount,
    validate_manual_refunds,
)

# UZS/KGS market policy: nearest whole som with HALF_UP.
QUANT = Decimal("1")


def _q(d: Decimal) -> Decimal:
    return d.quantize(QUANT, rounding=ROUND_HALF_UP)


def _next_public_sale_no() -> str:
    last = Sale.objects.select_for_update().order_by("-completed_at", "-id").first()
    if not last or not (last.public_sale_no or "").startswith("S-"):
        return "S-000001"
    try:
        seq = int(last.public_sale_no.split("-", 1)[1]) + 1
    except Exception:
        seq = 1
    return f"S-{seq:06d}"


def complete_sale(
    *,
    idempotency_key: str,
    cashier: User,
    lines: list[dict[str, Any]],
    payments: list[dict[str, Any]],
    customer: dict[str, Any] | None,
    order_discount: Decimal | None = None,
    expected_grand_total: Decimal | None = None,
    debt_due_date=None,
    debt_installment_months: int | None = None,
    note: str = "",
) -> Sale:
    if not idempotency_key or len(idempotency_key) > 64:
        raise ValueError("Idempotency-Key required (max 64 chars)")

    existing = Sale.objects.filter(
        idempotency_key=idempotency_key,
        status=Sale.Status.COMPLETED,
    ).first()
    if existing:
        return existing

    if not lines:
        raise ValueError("At least one line required")

    attempts = 3
    for idx in range(attempts):
        try:
            with transaction.atomic():
                sale = _complete_sale_inner(
                    idempotency_key=idempotency_key,
                    cashier=cashier,
                    lines=lines,
                    payments=payments,
                    customer=customer,
                    order_discount=order_discount,
                    expected_grand_total=expected_grand_total,
                    debt_due_date=debt_due_date,
                    debt_installment_months=debt_installment_months,
                    note=note,
                )
                return sale
        except IntegrityError:
            return Sale.objects.get(idempotency_key=idempotency_key)
        except OperationalError as ex:
            msg = str(ex).lower()
            locked = "database is locked" in msg or "database table is locked" in msg
            if (not locked) or idx == attempts - 1:
                raise
            time.sleep(0.08 * (idx + 1))


def _complete_sale_inner(
    *,
    idempotency_key: str,
    cashier: User,
    lines: list[dict[str, Any]],
    payments: list[dict[str, Any]],
    customer: dict[str, Any] | None,
    order_discount: Decimal | None,
    expected_grand_total: Decimal | None,
    debt_due_date,
    debt_installment_months: int | None,
    note: str,
) -> Sale:
    from .models import CardBank

    parsed_lines: list[dict[str, Any]] = []
    subtotal = Decimal("0")
    discount_total = Decimal("0")

    for raw in lines:
        vid = raw["variant_id"]
        qty = parse_qty(raw["qty"])
        is_bonus = bool(raw.get("is_bonus"))
        line_discount = _q(Decimal(str(raw.get("line_discount") or "0")))
        if line_discount < 0:
            raise ValueError("line_discount cannot be negative")

        v = (
            ProductVariant.objects.select_related("product")
            .filter(pk=vid, is_active=True, deleted_at__isnull=True)
            .first()
        )
        if not v:
            raise ValueError(f"Variant not found or inactive: {vid}")

        validate_sale_qty(qty, getattr(v, "unit", None) or "dona")

        if is_bonus:
            list_price = Decimal("0")
            line_discount = Decimal("0")
            net_unit = Decimal("0")
            line_total = Decimal("0")
            # Hisobot uchun: katalogdagi ro'yxat narxini saqlab qo'yamiz (bonus qiymati)
            raw_unit_price = raw.get("unit_price")
            if raw_unit_price is not None and str(raw_unit_price).strip() != "":
                list_price = _q(Decimal(str(raw_unit_price)))
            elif v.list_price is not None:
                list_price = _q(v.list_price)
            else:
                list_price = Decimal("0")
            # Bonus: to'lovga ta'sir qilmasin
            net_unit = Decimal("0")
            line_total = Decimal("0")
            # subtotal ga bonus list qiymatini qo'shmaymiz
        else:
            raw_unit_price = raw.get("unit_price")
            if raw_unit_price is not None and str(raw_unit_price).strip() != "":
                list_price = _q(Decimal(str(raw_unit_price)))
            elif v.list_price is not None:
                list_price = _q(v.list_price)
            else:
                raise ValueError("Unit price required for variant without list_price")

            # Avval qator jami, keyin net_unit — butun so'm roundingda 1 so'm farq chiqmasin
            line_sub = _q(list_price * Decimal(qty))
            if line_discount > line_sub:
                raise ValueError("Discount exceeds line subtotal")
            line_total = _q(line_sub - line_discount)
            net_unit = _q(line_total / Decimal(qty)) if qty else Decimal("0")
            subtotal += line_sub
            discount_total += line_discount

        purchase_cost = _q(v.purchase_price)

        parsed_lines.append(
            {
                "variant": v,
                "qty": qty,
                "list_unit_price": list_price if not is_bonus else list_price,
                "line_discount": line_discount,
                "net_unit_price": net_unit,
                "purchase_unit_cost": purchase_cost,
                "line_total": line_total,
                "is_bonus": is_bonus,
            }
        )

    order_discount_amount = _q(Decimal(str(order_discount or "0")))
    if order_discount_amount < 0:
        raise ValueError("order_discount cannot be negative")
    discount_total += order_discount_amount
    # Frontend POS: bonus qatorlar subtotalni kamaytirganda chegirma oshib ketmasin
    if discount_total > subtotal:
        discount_total = _q(subtotal)
    grand_total = _q(subtotal - discount_total)
    if grand_total < 0:
        raise InvalidPaymentSplit("Grand total cannot be negative")
    if expected_grand_total is not None and _q(expected_grand_total) != grand_total:
        raise InvalidPaymentSplit("Frontend total mismatch with authoritative backend total")

    pay_sum = Decimal("0")
    debt_amount = Decimal("0")
    parsed_pays: list[dict[str, Any]] = []
    valid_banks = {c.value for c in CardBank}

    if grand_total == 0:
        # Faqat bonus / 0 so'm chek — to'lov shart emas (0 summali payment qatorlarini e'tiborsiz qoldiramiz)
        if payments:
            for p in payments:
                amt = _q(Decimal(str(p["amount"])))
                if amt != 0:
                    raise InvalidPaymentSplit("Zero-total sale cannot have non-zero payments")
    else:
        for p in payments:
            method = p["method"]
            amt = _q(Decimal(str(p["amount"])))
            if amt <= 0:
                continue  # Bo'sh/0 qatorlar — e'tiborsiz (frontend ba'zan qoldirishi mumkin)
            card_bank = (p.get("card_bank") or "").strip().upper()
            if method == Payment.Method.CARD:
                if card_bank not in valid_banks:
                    raise ValueError("card_bank required for CARD (MBANK, BAKAI, ZERO, EKO_ISLAMIC)")
            else:
                card_bank = ""
            pay_sum += amt
            if method == Payment.Method.DEBT:
                debt_amount += amt
            parsed_pays.append({"method": method, "amount": amt, "card_bank": card_bank})

        if not parsed_pays or _q(pay_sum) != grand_total:
            raise InvalidPaymentSplit("Payments must equal grand total")

    if debt_amount > 0:
        if not customer:
            raise DebtPolicyError("Customer required for debt payment")
        cust = _resolve_customer(customer)
        if debt_installment_months is not None:
            months = int(debt_installment_months)
            if months < 1:
                raise ValueError("debt_installment_months must be >= 1")
        else:
            months = None

    sale = Sale.objects.create(
        public_sale_no=_next_public_sale_no(),
        idempotency_key=idempotency_key,
        cashier=cashier,
        subtotal=_q(subtotal),
        discount_total=_q(discount_total),
        grand_total=_q(grand_total),
        note=note or "",
        status=Sale.Status.COMPLETED,
    )

    for pl in parsed_lines:
        SaleLine.objects.create(
            sale=sale,
            variant=pl["variant"],
            qty=pl["qty"],
            list_unit_price=pl["list_unit_price"],
            line_discount=pl["line_discount"],
            net_unit_price=pl["net_unit_price"],
            purchase_unit_cost=pl["purchase_unit_cost"],
            line_total=pl["line_total"],
            is_bonus=pl["is_bonus"],
        )
        apply_movement(
            variant=pl["variant"],
            qty_delta=-pl["qty"],
            movement_type=InventoryMovement.Type.SALE,
            user=cashier,
            ref_sale=sale,
            note="POS sale" + (" (bonus)" if pl["is_bonus"] else ""),
        )

    for pp in parsed_pays:
        Payment.objects.create(
            sale=sale,
            method=pp["method"],
            amount=pp["amount"],
            card_bank=pp.get("card_bank") or "",
        )

    if debt_amount > 0:
        monthly = None
        if months:
            monthly = _q(debt_amount / Decimal(months))
        Debt.objects.create(
            customer=cust,
            originating_sale=sale,
            total_amount=_q(debt_amount),
            paid_amount=Decimal("0"),
            remaining_amount=_q(debt_amount),
            due_date=debt_due_date,
            installment_months=months,
            monthly_amount=monthly,
            status=Debt.Status.OPEN,
        )

    log_audit(
        event_type="sale_completed",
        actor=cashier.username,
        entity_id=str(sale.id),
        payload={
            "grand_total": str(sale.grand_total),
            "line_count": len(parsed_lines),
            "payment_count": len(parsed_pays),
            "bonus_lines": sum(1 for pl in parsed_lines if pl["is_bonus"]),
        },
    )

    return sale


def _resolve_customer(data: dict[str, Any]) -> Customer:
    if cid := data.get("id"):
        return Customer.objects.get(pk=cid)
    name = data.get("name")
    phone = data.get("phone_normalized")
    if not name or not phone:
        raise DebtPolicyError("Customer name and phone required for debt")
    cust, _ = Customer.objects.get_or_create(
        phone_normalized=phone,
        defaults={"name": name, "note": data.get("note", "")},
    )
    if cust.name != name:
        cust.name = name
        cust.save(update_fields=["name"])
    return cust


@transaction.atomic
def void_sale(*, sale: Sale, user: User, reason: str = "") -> dict[str, Any]:
    if sale.status == Sale.Status.VOIDED:
        return {
            "sale": sale,
            "restocked_lines": [],
            "return_amount": "0",
            "refunds": [],
        }

    if sale.status != Sale.Status.COMPLETED:
        raise ValueError("Only completed sales can be voided")

    sale_lines = list(
        SaleLine.objects.select_related("variant").filter(sale=sale)
    )
    # Pul uchun: bonus hisobga olinmaydi (line_total=0)
    remaining_lines = remaining_return_line_payloads(
        sale, sale_lines, include_bonus=False
    )
    restocked: list[dict[str, Any]] = []

    sold_by_vid: dict[str, Decimal] = {}
    for ln in sale_lines:
        key = str(ln.variant_id)
        sold_by_vid[key] = sold_by_vid.get(key, Decimal("0")) + parse_qty(ln.qty)

    already_returned: dict[str, Decimal] = {}
    for mv in InventoryMovement.objects.filter(
        ref_sale=sale, type=InventoryMovement.Type.RETURN, reversed_at__isnull=True
    ):
        key = str(mv.variant_id)
        delta = parse_qty(mv.qty_delta or 0)
        if delta < 0:
            delta = Decimal("0")
        already_returned[key] = already_returned.get(key, Decimal("0")) + delta

    restock_plan: list[tuple[str, Decimal]] = []
    for vid, sold_qty in sold_by_vid.items():
        ret = already_returned.get(vid, Decimal("0"))
        rem = sold_qty - ret
        if rem > 0:
            restock_plan.append((vid, rem))

    if not restock_plan:
        raise ValueError("Sale has no remaining merchandise to void (fully returned)")

    for vid, rem in restock_plan:
        variant = ProductVariant.objects.get(pk=vid)
        apply_movement(
            variant=variant,
            qty_delta=rem,
            movement_type=InventoryMovement.Type.RETURN,
            user=user,
            ref_sale=sale,
            note=f"Void remaining restock. {reason}".strip(),
        )
        restocked.append({"variant_id": vid, "qty": rem})

    return_amount = (
        compute_return_amount(sale=sale, lines=remaining_lines) if remaining_lines else Decimal("0")
    )
    refunds_applied: list[dict[str, str]] = []
    if return_amount > 0:
        refund_rows = allocate_auto_refunds(
            sale=sale, return_amount=return_amount, for_void=True
        )
        refunds_applied = apply_sale_refunds(
            sale=sale, user=user, refunds=refund_rows, reason=f"Void: {reason}".strip()
        )

    debt = Debt.objects.filter(originating_sale_id=sale.pk).first()
    if debt:
        # Void: majburiyat yopiladi; to'langan qism CASH refund orqali qaytarilgan
        debt.status = Debt.Status.VOIDED
        debt.remaining_amount = Decimal("0")
        if debt.paid_amount > debt.total_amount:
            debt.paid_amount = debt.total_amount
        debt.save(update_fields=["status", "paid_amount", "remaining_amount", "updated_at"])

    sale.status = Sale.Status.VOIDED
    sale.note = f"{sale.note}\nVOID: {reason}".strip() if reason else sale.note
    sale.save(update_fields=["status", "note"])
    log_audit(
        event_type="sale_voided",
        actor=user.username if user else None,
        entity_id=str(sale.id),
        payload={
            "reason": reason,
            "restocked_lines": restocked,
            "return_amount": str(return_amount),
            "refunds": refunds_applied,
        },
    )
    return {
        "sale": sale,
        "restocked_lines": restocked,
        "return_amount": str(return_amount),
        "refunds": refunds_applied,
    }


@transaction.atomic
def return_sale_lines(
    *,
    sale: Sale,
    user: User,
    lines: list[dict[str, Any]],
    reason: str = "",
    refunds: list[dict[str, Any]] | None = None,
    auto_refund: bool = True,
    skip_refund: bool = False,
    return_amount_override: Decimal | None = None,
) -> dict[str, Any]:
    from .refund_utils import q_money

    if sale.status != Sale.Status.COMPLETED:
        raise ValueError("Only completed sales can be partially returned")
    if not lines:
        raise ValueError("At least one return line required")

    sale_lines = list(SaleLine.objects.filter(sale=sale))

    # Bonus qatorlar vozvratga kirmaydi
    sold_by_variant: dict[str, Decimal] = {}
    for ln in sale_lines:
        if ln.is_bonus:
            continue
        key = str(ln.variant_id)
        sold_by_variant[key] = sold_by_variant.get(key, Decimal("0")) + parse_qty(ln.qty)

    already_returned: dict[str, Decimal] = {}
    for mv in InventoryMovement.objects.filter(
        ref_sale=sale, type=InventoryMovement.Type.RETURN, reversed_at__isnull=True
    ):
        key = str(mv.variant_id)
        delta = parse_qty(mv.qty_delta or 0)
        if delta < 0:
            delta = Decimal("0")
        already_returned[key] = already_returned.get(key, Decimal("0")) + delta

    applied: list[dict[str, Any]] = []
    for item in lines:
        variant_id = str(item["variant_id"])
        qty = parse_qty(item["qty"])
        sold_qty = sold_by_variant.get(variant_id, Decimal("0"))
        returned_qty = already_returned.get(variant_id, Decimal("0"))
        remaining = sold_qty - returned_qty
        if sold_qty <= 0:
            raise ValueError(f"Variant not found in sale (or bonus-only): {variant_id}")
        if qty > remaining:
            raise ValueError(f"Return qty exceeds remaining sold qty for variant: {variant_id}")
        variant = ProductVariant.objects.get(pk=variant_id)
        validate_sale_qty(qty, getattr(variant, "unit", None) or "dona")
        apply_movement(
            variant=variant,
            qty_delta=qty,
            movement_type=InventoryMovement.Type.RETURN,
            user=user,
            ref_sale=sale,
            note=f"Partial return. {reason}".strip(),
        )

        applied.append({"variant_id": variant_id, "qty": str(qty)})
        already_returned[variant_id] = returned_qty + qty

    computed_amount = compute_return_amount(sale=sale, lines=lines)
    if return_amount_override is not None:
        return_amount = q_money(return_amount_override)
        if return_amount < 0:
            raise ValueError("Return amount cannot be negative")
        if return_amount > computed_amount:
            raise ValueError("Return amount exceeds maximum for selected items")
    else:
        return_amount = computed_amount
    refunds_applied: list[dict[str, str]] = []
    if not skip_refund and return_amount > 0:
        if auto_refund or not refunds:
            refund_rows = allocate_auto_refunds(sale=sale, return_amount=return_amount)
        else:
            refund_rows = validate_manual_refunds(
                sale=sale, return_amount=return_amount, refunds=refunds
            )
        refunds_applied = apply_sale_refunds(
            sale=sale, user=user, refunds=refund_rows, reason=reason
        )

    if reason:
        sale.note = f"{sale.note}\nRETURN: {reason}".strip()
        sale.save(update_fields=["note"])
    log_audit(
        event_type="sale_partial_returned",
        actor=user.username if user else None,
        entity_id=str(sale.id),
        payload={
            "line_count": len(applied),
            "reason": reason,
            "lines": applied,
            "return_amount": str(return_amount),
            "computed_return_amount": str(computed_amount),
            "refunds": refunds_applied,
        },
    )
    return {
        "sale_id": str(sale.id),
        "status": sale.status,
        "lines": applied,
        "return_amount": str(return_amount),
        "computed_return_amount": str(computed_amount),
        "refunds": refunds_applied,
    }
