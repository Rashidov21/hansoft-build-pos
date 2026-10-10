"""P1: J6 sale requires open shift; H4 expense auto-links related_shift."""

from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from catalog.models import Category, Product, ProductVariant
from core.exceptions import NoOpenShiftError
from expenses.models import Shift, ShopExpense
from sales.services import complete_sale


def _mk_user(username: str, role: str = "CASHIER") -> User:
    u = User.objects.create_user(username=username, password="pass12345")
    u.profile.role = role
    u.profile.save(update_fields=["role"])
    return u


def _mk_variant(barcode: str = "BC-P1-1") -> ProductVariant:
    cat = Category.objects.create(name_uz="B", name_ru="B")
    prod = Product.objects.create(category=cat, name_uz="P", name_ru="P")
    return ProductVariant.objects.create(
        product=prod,
        barcode=barcode,
        purchase_price=Decimal("10000"),
        list_price=Decimal("20000"),
        stock_qty=Decimal("10"),
    )


@pytest.mark.django_db
@pytest.mark.no_auto_shift
def test_j6_sale_without_open_shift_rejected():
    cashier = _mk_user("p1_no_shift")
    v = _mk_variant()
    with pytest.raises(NoOpenShiftError):
        complete_sale(
            idempotency_key="p1-noshift",
            cashier=cashier,
            lines=[{"variant_id": str(v.id), "qty": 1, "line_discount": "0"}],
            payments=[{"method": "CASH", "amount": "20000"}],
            customer=None,
        )


@pytest.mark.django_db
def test_j6_sale_binds_open_shift():
    cashier = _mk_user("p1_with_shift")
    v = _mk_variant("BC-P1-2")
    # conftest auto-opens shift
    sale = complete_sale(
        idempotency_key="p1-bind",
        cashier=cashier,
        lines=[{"variant_id": str(v.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "CASH", "amount": "20000"}],
        customer=None,
    )
    assert sale.shift_id is not None
    assert Shift.objects.filter(pk=sale.shift_id, status=Shift.Status.OPEN).exists()


@pytest.mark.django_db
def test_h4_expense_auto_related_shift():
    user = _mk_user("p1_exp", "ADMIN")
    shift = Shift.objects.create(cashier=user, status=Shift.Status.OPEN)
    api = APIClient()
    api.force_authenticate(user=user)
    r = api.post(
        "/api/expenses/",
        {"amount": "15000", "category": "OTHER", "note": "taxi"},
        format="json",
    )
    assert r.status_code in (200, 201), r.content
    exp = ShopExpense.objects.get(pk=r.json()["id"])
    assert exp.related_shift_id == shift.id
