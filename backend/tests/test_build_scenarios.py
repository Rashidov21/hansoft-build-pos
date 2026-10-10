"""End-to-end scenario coverage for build-materials POS (S1–S4, S2, units, qaytim-ready complete)."""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from accounts.models import Role, UserProfile
from catalog.models import Category, Product, ProductVariant
from core.qty import UNIT_DONA, UNIT_KG, UNIT_M, UNIT_QOP
from sales.models import Sale
from sales.services import complete_sale


User = get_user_model()


def _cashier(username: str = "scen_cashier"):
    user = User.objects.create_user(username=username, password="pass12345")
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.role = Role.CASHIER
    profile.save(update_fields=["role"])
    return user


def _variant(
    *,
    name: str = "Sement",
    unit: str = UNIT_DONA,
    stock: str = "100",
    list_price: str = "50000",
    wholesale: str | None = None,
) -> ProductVariant:
    cat = Category.objects.create(name_uz="Cat", name_ru="Cat")
    prod = Product.objects.create(category=cat, name_uz=name, name_ru=name)
    kwargs = dict(
        product=prod,
        unit=unit,
        purchase_price=Decimal("40000"),
        list_price=Decimal(list_price),
        stock_qty=Decimal(stock),
    )
    if wholesale is not None:
        kwargs["wholesale_price"] = Decimal(wholesale)
    return ProductVariant.objects.create(**kwargs)


@pytest.mark.django_db
def test_s1_nakladnoy_then_complete_stock_only_on_pay(client):
    """S1: nakladnoy print does not touch stock; complete_sale decrements."""
    cashier = _cashier("s1_cashier")
    v = _variant(stock="50", list_price="68000", unit=UNIT_QOP)
    client.force_login(cashier)

    r = client.post(
        "/api/printing/nakladnoy/escpos/",
        data={
            "lines": [
                {
                    "name": "Sement M400",
                    "qty": "2",
                    "unit": UNIT_QOP,
                    "unit_price": "68000",
                    "line_total": "136000",
                }
            ]
        },
        content_type="application/json",
    )
    assert r.status_code == 200
    assert r.json()["stock_changed"] is False
    v.refresh_from_db()
    assert v.stock_qty == Decimal("50")
    assert Sale.objects.count() == 0

    sale = complete_sale(
        idempotency_key="s1-complete",
        cashier=cashier,
        lines=[{"variant_id": str(v.id), "qty": 2, "line_discount": "0", "unit_price": "68000"}],
        payments=[{"method": "CASH", "amount": "136000"}],
        customer=None,
    )
    v.refresh_from_db()
    assert v.stock_qty == Decimal("48")
    assert sale.grand_total == Decimal("136000")


@pytest.mark.django_db
def test_s2_wholesale_unit_price_on_complete():
    """S2: cashier can sell at wholesale via unit_price override."""
    cashier = _cashier("s2_cashier")
    v = _variant(stock="20", list_price="50000", wholesale="47000")
    sale = complete_sale(
        idempotency_key="s2-wholesale",
        cashier=cashier,
        lines=[
            {
                "variant_id": str(v.id),
                "qty": 1,
                "line_discount": "0",
                "unit_price": "47000",
                "price_tier": "wholesale",
            }
        ],
        payments=[{"method": "CASH", "amount": "47000"}],
        customer=None,
    )
    assert sale.grand_total == Decimal("47000")
    v.refresh_from_db()
    assert v.stock_qty == Decimal("19")


@pytest.mark.django_db
def test_s3_debt_sale_creates_debt():
    """S3: nasiya with customer."""
    from debt.models import Debt

    cashier = _cashier("s3_cashier")
    v = _variant(stock="10", list_price="100000")
    sale = complete_sale(
        idempotency_key="s3-debt",
        cashier=cashier,
        lines=[{"variant_id": str(v.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "DEBT", "amount": "100000"}],
        customer={"name": "Usta Ali", "phone_normalized": "998901112233"},
    )
    debt = Debt.objects.get(originating_sale=sale)
    assert debt.total_amount == Decimal("100000")
    assert debt.remaining_amount == Decimal("100000")


@pytest.mark.django_db
def test_s4_cancel_after_nakladnoy_no_stock_change(client):
    """S4: print nakladnoy then abandon (no complete) — stock unchanged."""
    cashier = _cashier("s4_cashier")
    v = _variant(stock="33", list_price="1800")
    before = v.stock_qty
    client.force_login(cashier)
    r = client.post(
        "/api/printing/nakladnoy/escpos/",
        data={
            "lines": [
                {
                    "name": "G'isht",
                    "qty": "10",
                    "unit": UNIT_DONA,
                    "unit_price": "1800",
                }
            ]
        },
        content_type="application/json",
    )
    assert r.status_code == 200
    # "Cancel" = no complete_sale
    v.refresh_from_db()
    assert v.stock_qty == before
    assert Sale.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    "unit,qty,list_price,pay",
    [
        (UNIT_DONA, "3", "1800", "5400"),
        (UNIT_KG, "12.5", "200", "2500"),
        (UNIT_M, "0.5", "13000", "6500"),
        (UNIT_QOP, "2", "68000", "136000"),
    ],
)
def test_quick_path_all_units(unit, qty, list_price, pay):
    """Tezkor yo‘l: har bir birlik bo‘yicha stock kamayadi."""
    cashier = _cashier(f"unit_{unit}_{qty}".replace(".", "_"))
    v = _variant(name=f"Item-{unit}", unit=unit, stock="1000", list_price=list_price)
    sale = complete_sale(
        idempotency_key=f"quick-{unit}-{qty}",
        cashier=cashier,
        lines=[
            {
                "variant_id": str(v.id),
                "qty": Decimal(qty),
                "line_discount": "0",
                "unit_price": list_price,
            }
        ],
        payments=[{"method": "CASH", "amount": pay}],
        customer=None,
    )
    v.refresh_from_db()
    assert v.stock_qty == Decimal("1000") - Decimal(qty)
    assert sale.grand_total == Decimal(pay)


@pytest.mark.django_db
def test_cash_overpay_trimmed_equals_grand():
    """Qaytim: frontend trims excess; backend requires exact grand (simulate trim)."""
    cashier = _cashier("qaytim_cashier")
    v = _variant(stock="5", list_price="68000")
    # Customer tendered 100000; POS sends only 68000 CASH
    sale = complete_sale(
        idempotency_key="qaytim-exact",
        cashier=cashier,
        lines=[{"variant_id": str(v.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "CASH", "amount": "68000"}],
        customer=None,
        expected_grand_total=Decimal("68000"),
    )
    assert sale.grand_total == Decimal("68000")


@pytest.mark.django_db
def test_split_card_cash_equals_grand():
    cashier = _cashier("split_cashier")
    v = _variant(stock="5", list_price="100000")
    sale = complete_sale(
        idempotency_key="split-pay",
        cashier=cashier,
        lines=[{"variant_id": str(v.id), "qty": 1, "line_discount": "0"}],
        payments=[
            {"method": "CARD", "amount": "40000", "card_bank": "MBANK"},
            {"method": "CASH", "amount": "60000"},
        ],
        customer=None,
    )
    assert sale.grand_total == Decimal("100000")
