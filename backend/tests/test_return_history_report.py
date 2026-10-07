"""Returns history report API and accrual dashboard metrics."""

import pytest
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APIClient

from catalog.models import Category, Product, ProductVariant
from reports.services import sales_metrics
from sales.services import complete_sale, return_sale_lines


def _mk_user(username: str, role: str) -> User:
    u = User.objects.create_user(username=username, password="pass12345")
    u.profile.role = role
    u.profile.save(update_fields=["role"])
    return u


def _mk_variant() -> ProductVariant:
    cat = Category.objects.create(name_uz="Samsung", name_ru="Samsung")
    prod = Product.objects.create(category=cat, name_uz="TV 55", name_ru="TV 55")
    return ProductVariant.objects.create(
        product=prod,
        purchase_price=Decimal("100000"),
        list_price=Decimal("150000"),
        stock_qty=10,
        barcode="BC-RET-HIST",
    )


@pytest.mark.django_db
def test_returns_history_api_lists_return_row():
    owner = _mk_user("owner_ret_hist", "OWNER")
    cashier = _mk_user("cashier_ret_hist", "CASHIER")
    variant = _mk_variant()
    sale = complete_sale(
        idempotency_key="ret-hist-sale",
        cashier=cashier,
        lines=[{"variant_id": str(variant.id), "qty": 2, "line_discount": "0"}],
        payments=[{"method": "CASH", "amount": "300000"}],
        customer=None,
    )
    return_sale_lines(
        sale=sale,
        user=cashier,
        lines=[{"variant_id": str(variant.id), "qty": 1}],
        reason="hist",
    )

    api = APIClient()
    api.force_authenticate(user=owner)
    r = api.get("/api/reports/returns/")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1
    assert body["summary"]["return_qty"] >= 1
    row = body["results"][0]
    assert row["barcode"] == "BC-RET-HIST"
    assert Decimal(row["return_amount"]) == Decimal("150000")


@pytest.mark.django_db
def test_net_sales_accrual_after_partial_return():
    cashier = _mk_user("cashier_accrual", "CASHIER")
    variant = _mk_variant()
    sale = complete_sale(
        idempotency_key="accrual-sale",
        cashier=cashier,
        lines=[{"variant_id": str(variant.id), "qty": 2, "line_discount": "0"}],
        payments=[{"method": "CASH", "amount": "300000"}],
        customer=None,
    )
    return_sale_lines(
        sale=sale,
        user=cashier,
        lines=[{"variant_id": str(variant.id), "qty": 1}],
        reason="half",
    )
    m = sales_metrics()
    assert str(m["returned_total_attributed"]) == "150000"
    assert str(m["net_sales_accrual"]) == "150000"
    assert str(m["today_net_sales"]) == "150000"


@pytest.mark.django_db
def test_sale_history_lines_include_amounts():
    owner = _mk_user("owner_line_amt", "OWNER")
    cashier = _mk_user("cashier_line_amt", "CASHIER")
    variant = _mk_variant()
    complete_sale(
        idempotency_key="line-amt-sale",
        cashier=cashier,
        lines=[{"variant_id": str(variant.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "CASH", "amount": "150000"}],
        customer=None,
    )
    api = APIClient()
    api.force_authenticate(user=owner)
    r = api.get("/api/sales/")
    assert r.status_code == 200
    row = r.json()["results"][0]
    assert row["lines"][0]["line_total"] == "150000"
    assert row["lines"][0]["category_name_uz"] == "Samsung"
