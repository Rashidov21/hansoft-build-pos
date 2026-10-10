"""P0a: J2 low-stock Decimal, J3 sale line price + payments, H2 return_status, H5 negative prices."""

from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from catalog.low_stock import get_low_stock_by_brand, get_low_stock_by_model, get_low_stock_summary
from catalog.models import Category, Product, ProductVariant
from catalog.serializers import PosPriceUpdateSerializer, ProductVariantSerializer
from core.qty import UNIT_KG
from debt.models import Customer
from sales.models import Payment, Sale
from sales.services import complete_sale, edit_sale_line_price, return_sale_lines


def _mk_user(username: str, role: str) -> User:
    u = User.objects.create_user(username=username, password="pass12345")
    u.profile.role = role
    u.profile.save(update_fields=["role"])
    return u


def _mk_variant(**kwargs) -> ProductVariant:
    cat = Category.objects.create(name_uz="Brand", name_ru="Brand")
    prod = Product.objects.create(category=cat, name_uz="SKU", name_ru="SKU")
    defaults = dict(
        product=prod,
        purchase_price=Decimal("50000"),
        list_price=Decimal("73000"),
        stock_qty=Decimal("5"),
        barcode="BC-P0A-1",
        unit="dona",
    )
    defaults.update(kwargs)
    return ProductVariant.objects.create(**defaults)


@pytest.mark.django_db
def test_j2_low_stock_by_brand_and_model_no_field_error():
    _mk_variant(stock_qty=Decimal("0.5"), barcode="BC-LOW-1")
    _mk_variant(stock_qty=Decimal("1"), barcode="BC-LOW-2", list_price=Decimal("10000"))

    by_brand = get_low_stock_by_brand(threshold=Decimal("2"))
    by_model = get_low_stock_by_model(threshold=Decimal("2"))
    summary = get_low_stock_summary(threshold=Decimal("2"))

    assert len(by_brand) >= 1
    assert len(by_model) >= 1
    assert summary["total_low_stock_variants"] >= 1
    assert by_brand[0]["total_stock"] is not None


@pytest.mark.django_db
def test_j3_sale_line_price_edit_syncs_cash_payment():
    owner = _mk_user("p0a_owner", "OWNER")
    cashier = _mk_user("p0a_cash", "CASHIER")
    variant = _mk_variant()
    sale = complete_sale(
        idempotency_key="p0a-price-1",
        cashier=cashier,
        lines=[{"variant_id": str(variant.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "CASH", "amount": "73000"}],
        customer=None,
    )
    line = sale.lines.get()

    out = edit_sale_line_price(
        sale=sale, line=line, new_price=Decimal("80000"), user=owner
    )
    sale.refresh_from_db()
    line.refresh_from_db()
    pay = Payment.objects.get(sale=sale)

    assert out["sale_grand_total"] == "80000"
    assert line.list_unit_price == Decimal("80000")
    assert sale.grand_total == Decimal("80000")
    assert pay.amount == Decimal("80000")

    api = APIClient()
    api.force_authenticate(user=owner)
    r = api.patch(
        f"/api/sales/{sale.id}/line/{line.id}/price/",
        {"list_unit_price": "90000"},
        format="json",
    )
    assert r.status_code == 200, r.content
    assert r.json()["sale_grand_total"] == "90000"
    sale.refresh_from_db()
    assert Payment.objects.get(sale=sale).amount == Decimal("90000")


@pytest.mark.django_db
def test_h2_debt_sale_full_return_status_full():
    owner = _mk_user("p0a_debt_owner", "OWNER")
    cashier = _mk_user("p0a_debt_cash", "CASHIER")
    variant = _mk_variant(barcode="BC-DEBT-1")
    cust = Customer.objects.create(name="Ali", phone_normalized="998901112233")
    sale = complete_sale(
        idempotency_key="p0a-debt-1",
        cashier=cashier,
        lines=[{"variant_id": str(variant.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "DEBT", "amount": "73000"}],
        customer={"id": str(cust.id)},
    )
    return_sale_lines(
        sale=sale,
        user=cashier,
        lines=[{"variant_id": str(variant.id), "qty": 1}],
        reason="full debt return",
    )

    api = APIClient()
    api.force_authenticate(user=owner)
    r = api.get("/api/sales/")
    assert r.status_code == 200
    row = next(x for x in r.json()["results"] if x["id"] == str(sale.id))
    assert row["return_status"] == "full"
    assert row["can_void"] is False


@pytest.mark.django_db
def test_h2_fractional_qty_return_status_partial():
    owner = _mk_user("p0a_kg_owner", "OWNER")
    cashier = _mk_user("p0a_kg_cash", "CASHIER")
    variant = _mk_variant(
        barcode="BC-KG-1",
        unit=UNIT_KG,
        stock_qty=Decimal("10"),
        list_price=Decimal("10000"),
        purchase_price=Decimal("8000"),
    )
    sale = complete_sale(
        idempotency_key="p0a-kg-1",
        cashier=cashier,
        lines=[{"variant_id": str(variant.id), "qty": "1.5", "line_discount": "0"}],
        payments=[{"method": "CASH", "amount": "15000"}],
        customer=None,
    )
    return_sale_lines(
        sale=sale,
        user=cashier,
        lines=[{"variant_id": str(variant.id), "qty": "0.5"}],
        reason="partial kg",
    )

    api = APIClient()
    api.force_authenticate(user=owner)
    r = api.get("/api/sales/")
    row = next(x for x in r.json()["results"] if x["id"] == str(sale.id))
    assert row["return_status"] == "partial"


@pytest.mark.django_db
def test_h5_negative_prices_rejected():
    ser = PosPriceUpdateSerializer(data={"list_price": "-5"})
    assert ser.is_valid() is False

    cat = Category.objects.create(name_uz="C", name_ru="C")
    prod = Product.objects.create(category=cat, name_uz="N", name_ru="N")
    v = ProductVariant.objects.create(
        product=prod,
        purchase_price=Decimal("100"),
        list_price=Decimal("200"),
        stock_qty=Decimal("1"),
        barcode="BC-NEG-1",
    )
    vs = ProductVariantSerializer(
        instance=v, data={"purchase_price": "-1", "list_price": "200"}, partial=True
    )
    assert vs.is_valid() is False

    cashier = _mk_user("p0a_neg_cash", "CASHIER")
    with pytest.raises(ValueError, match="negative"):
        complete_sale(
            idempotency_key="p0a-neg-1",
            cashier=cashier,
            lines=[
                {
                    "variant_id": str(v.id),
                    "qty": 1,
                    "line_discount": "0",
                    "unit_price": "-5",
                }
            ],
            payments=[{"method": "CASH", "amount": "0"}],
            customer=None,
        )
