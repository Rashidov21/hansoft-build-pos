"""API: void refund split, partner revert, supplier CREDIT_MEMO."""

import uuid
from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from catalog.models import (
    Category,
    Product,
    ProductVariant,
    Supplier,
    SupplierTransaction,
)
from debt.models import Customer, Debt
from debt.services import record_debt_payment
from sales.services import complete_sale


def _owner():
    u = User.objects.create_user(username="api_owner", password="pass12345")
    u.profile.role = "OWNER"
    u.profile.save(update_fields=["role"])
    return u


def _cashier():
    u = User.objects.create_user(username="api_cashier", password="pass12345")
    u.profile.role = "CASHIER"
    u.profile.save(update_fields=["role"])
    return u


def _variant(**kw):
    cat = Category.objects.create(name_uz="C", name_ru="C")
    prod = Product.objects.create(category=cat, name_uz="P", name_ru="P")
    defaults = dict(
        product=prod,
        purchase_price=Decimal("50000"),
        list_price=Decimal("100000"),
        stock_qty=5,
        barcode=f"BC-{uuid.uuid4().hex[:8]}",
    )
    defaults.update(kw)
    return ProductVariant.objects.create(**defaults)


@pytest.mark.django_db
def test_void_api_returns_refund_split_after_debt_payment():
    owner = _owner()
    cashier = _cashier()
    variant = _variant()
    customer = Customer.objects.create(name="Ali", phone_normalized="998900001122")
    sale = complete_sale(
        idempotency_key=str(uuid.uuid4()),
        cashier=cashier,
        lines=[{"variant_id": str(variant.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "DEBT", "amount": "100000"}],
        customer={"name": customer.name, "phone_normalized": customer.phone_normalized},
    )
    record_debt_payment(customer=customer, amount=Decimal("40000"), user=cashier)

    api = APIClient()
    api.force_authenticate(user=owner)
    r = api.post(f"/api/sales/{sale.id}/void/", {"reason": "api void"}, format="json")
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["status"] == "VOIDED"
    assert body["return_amount"] == "100000"
    methods = {x["method"]: x["amount"] for x in body["refunds"]}
    assert methods["DEBT"] == "60000"
    assert methods["CASH"] == "40000"


@pytest.mark.django_db
def test_supplier_credit_memo_api_reduces_balance():
    owner = _owner()
    supplier = Supplier.objects.create(name_uz="Post", name_ru="Post")
    SupplierTransaction.objects.create(
        supplier=supplier,
        type=SupplierTransaction.Type.PURCHASE,
        amount=Decimal("500000"),
    )
    api = APIClient()
    api.force_authenticate(user=owner)
    r = api.post(
        f"/api/catalog/suppliers/{supplier.id}/transactions/",
        {"type": "CREDIT_MEMO", "amount": "100000", "note": "credit"},
        format="json",
    )
    assert r.status_code in (200, 201), r.content
    bal = api.get(f"/api/catalog/suppliers/{supplier.id}/balance/")
    assert bal.status_code == 200
    data = bal.json()
    assert Decimal(str(data["balance"])) == Decimal("400000")
