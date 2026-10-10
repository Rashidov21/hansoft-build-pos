"""P1b H3: reversing a return restores DEBT and soft-reverses SaleRefund."""

from decimal import Decimal

import pytest
from django.contrib.auth.models import User

from catalog.models import Category, Product, ProductVariant
from debt.models import Customer, Debt
from inventory.models import InventoryMovement
from sales.archive_services import reverse_return_movement
from sales.models import SaleRefund
from sales.services import complete_sale, return_sale_lines


def _mk_user(username: str) -> User:
    u = User.objects.create_user(username=username, password="pass12345")
    u.profile.role = "CASHIER"
    u.profile.save(update_fields=["role"])
    return u


@pytest.mark.django_db
def test_h3_reverse_return_restores_debt():
    cashier = _mk_user("p1b_rev")
    cat = Category.objects.create(name_uz="B", name_ru="B")
    prod = Product.objects.create(category=cat, name_uz="P", name_ru="P")
    v = ProductVariant.objects.create(
        product=prod,
        barcode="BC-P1B-1",
        purchase_price=Decimal("40000"),
        list_price=Decimal("73000"),
        stock_qty=Decimal("5"),
    )
    cust = Customer.objects.create(name="Ali", phone_normalized="998901110011")
    sale = complete_sale(
        idempotency_key="p1b-debt-ret",
        cashier=cashier,
        lines=[{"variant_id": str(v.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "DEBT", "amount": "73000"}],
        customer={"id": str(cust.id)},
    )
    debt = Debt.objects.get(originating_sale=sale)
    assert debt.remaining_amount == Decimal("73000")

    return_sale_lines(
        sale=sale,
        user=cashier,
        lines=[{"variant_id": str(v.id), "qty": 1}],
        reason="full return",
    )
    debt.refresh_from_db()
    assert debt.remaining_amount == Decimal("0")
    assert SaleRefund.objects.filter(sale=sale, method="DEBT", reversed_at__isnull=True).exists()

    mv = InventoryMovement.objects.filter(
        ref_sale=sale, type=InventoryMovement.Type.RETURN, reversed_at__isnull=True
    ).get()
    out = reverse_return_movement(movement_id=str(mv.id), user=cashier, reason="undo")
    assert out["refund_manual_required"] is False
    assert out["refunds_reversed"]

    debt.refresh_from_db()
    assert debt.remaining_amount == Decimal("73000")
    assert debt.status == Debt.Status.OPEN
    assert not SaleRefund.objects.filter(sale=sale, reversed_at__isnull=True).exists()

    v.refresh_from_db()
    # Return put stock back; reverse OUT removes it again → back to after-sale qty
    assert v.stock_qty == Decimal("4")
