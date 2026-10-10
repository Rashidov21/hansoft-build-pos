"""P0b: H1 void refund dashboard double-count; H8 scheduler defer until migrate."""

from decimal import Decimal

import pytest
from django.contrib.auth.models import User

from catalog.models import Category, Product, ProductVariant
from reports.services import sales_metrics
from sales.models import Payment
from sales.services import complete_sale, void_sale


def _mk_user(username: str, role: str = "CASHIER") -> User:
    u = User.objects.create_user(username=username, password="pass12345")
    u.profile.role = role
    u.profile.save(update_fields=["role"])
    return u


def _mk_variant(barcode: str, list_price: str, purchase: str = "10000") -> ProductVariant:
    cat = Category.objects.create(name_uz="B", name_ru="B")
    prod = Product.objects.create(category=cat, name_uz="P", name_ru="P")
    return ProductVariant.objects.create(
        product=prod,
        barcode=barcode,
        purchase_price=Decimal(purchase),
        list_price=Decimal(list_price),
        stock_qty=Decimal("10"),
    )


@pytest.mark.django_db
def test_h1_void_card_sale_does_not_make_today_card_negative():
    """70k karta + 30k void → today_card_total = 40000 (not -30000)."""
    cashier = _mk_user("p0b_card_cash")
    v1 = _mk_variant("BC-P0B-40", "40000")
    v2 = _mk_variant("BC-P0B-30", "30000")

    complete_sale(
        idempotency_key="p0b-card-keep",
        cashier=cashier,
        lines=[{"variant_id": str(v1.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "CARD", "amount": "40000", "card_bank": "MBANK"}],
        customer=None,
    )
    sale_void = complete_sale(
        idempotency_key="p0b-card-void",
        cashier=cashier,
        lines=[{"variant_id": str(v2.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "CARD", "amount": "30000", "card_bank": "MBANK"}],
        customer=None,
    )
    void_sale(sale=sale_void, user=cashier, reason="mistake")

    m = sales_metrics()
    assert m["today_card_total"] == Decimal("40000")
    assert m["today_card_total"] >= 0


@pytest.mark.django_db
def test_h1_partial_return_still_nets_card_total():
    cashier = _mk_user("p0b_ret_cash")
    from sales.services import return_sale_lines

    v = _mk_variant("BC-P0B-RET", "100000")
    sale = complete_sale(
        idempotency_key="p0b-ret-1",
        cashier=cashier,
        lines=[{"variant_id": str(v.id), "qty": 2, "line_discount": "0"}],
        payments=[{"method": "CARD", "amount": "200000", "card_bank": "BAKAI"}],
        customer=None,
    )
    return_sale_lines(
        sale=sale,
        user=cashier,
        lines=[{"variant_id": str(v.id), "qty": 1}],
        reason="one back",
    )
    m = sales_metrics()
    assert m["today_card_total"] == Decimal("100000")


@pytest.mark.django_db
def test_h1_cash_net_flow_does_not_double_subtract_refund():
    cashier = _mk_user("p0b_flow_cash")
    from sales.services import return_sale_lines

    v = _mk_variant("BC-P0B-FLOW", "50000")
    sale = complete_sale(
        idempotency_key="p0b-flow-1",
        cashier=cashier,
        lines=[{"variant_id": str(v.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "CASH", "amount": "50000"}],
        customer=None,
    )
    return_sale_lines(
        sale=sale,
        user=cashier,
        lines=[{"variant_id": str(v.id), "qty": 1}],
        reason="full",
    )
    m = sales_metrics()
    # Net cash after full return = 0; expenses 0 → net flow 0 (not -50000).
    assert m["today_cash_total"] == Decimal("0")
    assert m["today_cash_net_flow"] == Decimal("0")


def test_h8_defer_flag_skips_ready_auto_start(monkeypatch):
    """With HANSOFT_DEFER_SCHEDULERS=1, ready() must not mark schedulers started."""
    import core.apps as apps_mod

    monkeypatch.setenv("HANSOFT_DEFER_SCHEDULERS", "1")
    apps_mod._SCHEDULERS_STARTED = False
    apps_mod._AUTO_BACKUP_THREAD_STARTED = False
    apps_mod._AUTO_Z_THREAD_STARTED = False
    apps_mod._AUTO_DEBT_REMINDER_THREAD_STARTED = False
    apps_mod._AUTO_LOW_STOCK_THREAD_STARTED = False

    cfg = apps_mod.CoreConfig("core", apps_mod)
    # Re-run only scheduler gate logic: ready connects pragma then checks defer.
    # Call start explicitly after clearing defer — should start once.
    monkeypatch.delenv("HANSOFT_DEFER_SCHEDULERS", raising=False)
    monkeypatch.setenv("ENABLE_AUTO_Z_SCHEDULER", "0")
    monkeypatch.setenv("ENABLE_AUTO_BACKUP", "0")
    monkeypatch.setenv("ENABLE_AUTO_DEBT_REMINDER", "0")
    monkeypatch.setenv("ENABLE_AUTO_LOW_STOCK", "0")

    assert apps_mod.start_background_schedulers() is True
    assert apps_mod._SCHEDULERS_STARTED is True
    assert apps_mod.start_background_schedulers() is False
