"""P0c: J4 pos-price ACL, J5 price floor / below-cost, J7 inactive TG, M1 debt card bank."""

from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from catalog.models import Category, Product, ProductVariant
from core.exceptions import BelowCostError, PriceFloorError
from debt.models import Customer, Debt
from debt.services import record_debt_payment
from integrations.models import IntegrationSettings, ReportChannel
from integrations.report_routing import ensure_channels_from_legacy
from sales.services import complete_sale


def _mk_user(username: str, role: str) -> User:
    u = User.objects.create_user(username=username, password="pass12345")
    u.profile.role = role
    u.profile.save(update_fields=["role"])
    return u


def _mk_variant(**kwargs) -> ProductVariant:
    cat = Category.objects.create(name_uz="B", name_ru="B")
    prod = Product.objects.create(category=cat, name_uz="P", name_ru="P")
    defaults = dict(
        product=prod,
        purchase_price=Decimal("50000"),
        list_price=Decimal("73000"),
        wholesale_price=Decimal("65000"),
        stock_qty=Decimal("20"),
        barcode="BC-P0C-1",
    )
    defaults.update(kwargs)
    return ProductVariant.objects.create(**defaults)


@pytest.mark.django_db
def test_j4_cashier_pos_price_forbidden_admin_ok():
    cashier = _mk_user("p0c_cash", "CASHIER")
    admin = _mk_user("p0c_admin", "ADMIN")
    v = _mk_variant(barcode="BC-P0C-PRICE")

    api = APIClient()
    api.force_authenticate(user=cashier)
    r = api.post(f"/api/catalog/variants/{v.id}/pos-price/", {"list_price": "2"}, format="json")
    assert r.status_code == 403

    api.force_authenticate(user=admin)
    r2 = api.post(f"/api/catalog/variants/{v.id}/pos-price/", {"list_price": "70000"}, format="json")
    assert r2.status_code == 200, r2.content
    v.refresh_from_db()
    assert v.list_price == Decimal("70000")


@pytest.mark.django_db
def test_j5_cashier_cannot_sell_below_tier_floor():
    cashier = _mk_user("p0c_floor_cash", "CASHIER")
    v = _mk_variant(barcode="BC-P0C-FLOOR")
    with pytest.raises(PriceFloorError):
        complete_sale(
            idempotency_key="p0c-floor-1",
            cashier=cashier,
            lines=[
                {
                    "variant_id": str(v.id),
                    "qty": 1,
                    "unit_price": "5",
                    "price_tier": "retail",
                    "line_discount": "0",
                }
            ],
            payments=[{"method": "CASH", "amount": "5"}],
            customer=None,
        )


@pytest.mark.django_db
def test_j5_cashier_wholesale_tier_allows_wholesale_price():
    cashier = _mk_user("p0c_ws_cash", "CASHIER")
    v = _mk_variant(barcode="BC-P0C-WS")
    sale = complete_sale(
        idempotency_key="p0c-ws-1",
        cashier=cashier,
        lines=[
            {
                "variant_id": str(v.id),
                "qty": 1,
                "unit_price": "65000",
                "price_tier": "wholesale",
                "line_discount": "0",
            }
        ],
        payments=[{"method": "CASH", "amount": "65000"}],
        customer=None,
    )
    assert sale.grand_total == Decimal("65000")


@pytest.mark.django_db
def test_j5_admin_below_cost_requires_confirm():
    admin = _mk_user("p0c_bc_admin", "ADMIN")
    v = _mk_variant(barcode="BC-P0C-BC", purchase_price=Decimal("50000"), list_price=Decimal("73000"))
    with pytest.raises(BelowCostError):
        complete_sale(
            idempotency_key="p0c-bc-1",
            cashier=admin,
            lines=[
                {
                    "variant_id": str(v.id),
                    "qty": 1,
                    "unit_price": "40000",
                    "price_tier": "retail",
                    "line_discount": "0",
                }
            ],
            payments=[{"method": "CASH", "amount": "40000"}],
            customer=None,
            confirm_below_cost=False,
        )
    sale = complete_sale(
        idempotency_key="p0c-bc-2",
        cashier=admin,
        lines=[
            {
                "variant_id": str(v.id),
                "qty": 1,
                "unit_price": "40000",
                "price_tier": "retail",
                "line_discount": "0",
            }
        ],
        payments=[{"method": "CASH", "amount": "40000"}],
        customer=None,
        confirm_below_cost=True,
    )
    assert sale.grand_total == Decimal("40000")


@pytest.mark.django_db
def test_j7_inactive_telegram_channel_not_reactivated():
    settings = IntegrationSettings.get_solo()
    settings.telegram_chat_id = "111"
    settings.telegram_bot_token = "1:tok"
    settings.save()
    ch = ReportChannel.objects.create(
        name="Egasi (Telegram)",
        kind=ReportChannel.Kind.TELEGRAM,
        address="111",
        is_active=False,
        sort_order=0,
    )
    ensure_channels_from_legacy()
    ch.refresh_from_db()
    assert ch.is_active is False


@pytest.mark.django_db
def test_m1_debt_card_requires_bank():
    user = _mk_user("p0c_debt", "CASHIER")
    cust = Customer.objects.create(name="Ali", phone_normalized="998909998877")
    v = _mk_variant(barcode="BC-P0C-DEBT")
    sale = complete_sale(
        idempotency_key="p0c-debt-sale",
        cashier=user,
        lines=[{"variant_id": str(v.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "DEBT", "amount": "73000"}],
        customer={"id": str(cust.id)},
    )
    assert Debt.objects.filter(originating_sale=sale).exists()
    with pytest.raises(ValueError, match="card_bank"):
        record_debt_payment(
            customer=cust,
            amount=Decimal("10000"),
            user=user,
            method="CARD",
            card_bank="",
        )
    touched = record_debt_payment(
        customer=cust,
        amount=Decimal("10000"),
        user=user,
        method="CARD",
        card_bank="MBANK",
    )
    assert len(touched) == 1
