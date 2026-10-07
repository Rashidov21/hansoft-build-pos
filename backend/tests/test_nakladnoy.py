"""Nakladnoy (pick-list) A1: print does not change stock."""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from accounts.models import Role, UserProfile
from catalog.models import Category, Product, ProductVariant
from core.qty import UNIT_DONA, UNIT_KG
from printing.receipt import build_nakladnoy_dict, nakladnoy_plain_text


User = get_user_model()


def _mk_cashier(username: str = "cashier_nk"):
    user = User.objects.create_user(username=username, password="pass12345")
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.role = Role.CASHIER
    profile.save(update_fields=["role"])
    return user


def _mk_variant(*, stock: str = "50", unit: str = UNIT_DONA) -> ProductVariant:
    cat = Category.objects.create(name_uz="Qurilish", name_ru="Стройка")
    prod = Product.objects.create(category=cat, name_uz="Sement", name_ru="Цемент")
    return ProductVariant.objects.create(
        product=prod,
        unit=unit,
        purchase_price=Decimal("40000"),
        list_price=Decimal("50000"),
        stock_qty=Decimal(stock),
    )


@pytest.mark.django_db
def test_nakladnoy_plain_contains_title_and_hint():
    dto = build_nakladnoy_dict(
        lines=[
            {
                "name": "Sement 50kg",
                "qty": "2",
                "unit": "qop",
                "unit_price": "50000",
                "line_total": "100000",
            }
        ],
        cashier_username="ali",
        public_no="NK-TEST-1",
        lang="uz",
    )
    text = nakladnoy_plain_text(dto)
    assert "NAKLADNOY" in text.upper() or "nakladnoy" in text.lower()
    assert "NK-TEST-1" in text
    assert "Sement" in text
    assert "Ombor" in text or "ombor" in text.lower()


@pytest.mark.django_db
def test_nakladnoy_escpos_endpoint_no_stock_change(client):
    cashier = _mk_cashier()
    variant = _mk_variant(stock="80")
    before = variant.stock_qty
    client.force_login(cashier)

    r = client.post(
        "/api/printing/nakladnoy/escpos/",
        data={
            "lines": [
                {
                    "name": variant.product.name_uz,
                    "qty": "3",
                    "unit": UNIT_DONA,
                    "unit_price": "50000",
                    "line_total": "150000",
                }
            ],
            "note": "MVP test",
        },
        content_type="application/json",
        HTTP_ACCEPT_LANGUAGE="uz",
    )
    assert r.status_code == 200, r.content
    body = r.json()
    assert body.get("stock_changed") is False
    assert body.get("public_no")
    assert body.get("plain_text")
    assert body.get("raw_base64") or body.get("escpos_base64")
    assert "NAKLADNOY" in (body.get("plain_text") or "").upper() or "nakladnoy" in (
        body.get("plain_text") or ""
    ).lower()

    variant.refresh_from_db()
    assert variant.stock_qty == before
    from sales.models import Sale

    assert Sale.objects.count() == 0


@pytest.mark.django_db
def test_nakladnoy_requires_lines(client):
    cashier = _mk_cashier("cashier_nk_empty")
    client.force_login(cashier)
    r = client.post(
        "/api/printing/nakladnoy/escpos/",
        data={"lines": []},
        content_type="application/json",
    )
    assert r.status_code == 400


@pytest.mark.django_db
def test_nakladnoy_kg_line_in_plain():
    dto = build_nakladnoy_dict(
        lines=[
            {
                "name": "Armatura",
                "qty": "12.5",
                "unit": UNIT_KG,
                "unit_price": "12000",
            }
        ],
        cashier_username="vali",
        public_no="NK-KG",
        lang="uz",
    )
    text = nakladnoy_plain_text(dto)
    assert "12.5" in text
    assert "kg" in text.lower() or "KG" in text
