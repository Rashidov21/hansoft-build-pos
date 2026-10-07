"""Regressiya: line_discount rounding, partner void, supplier CREDIT_MEMO."""

import uuid
from decimal import Decimal

import pytest
from django.contrib.auth.models import User

from catalog.models import (
    Category,
    Product,
    ProductVariant,
    Supplier,
    SupplierTransaction,
)
from datetime import datetime, time, timedelta
from django.db.models import Sum
from django.utils import timezone

from catalog.supplier_services import get_supplier_balance
from debt.models import Customer, Debt
from debt.services import record_debt_payment
from reports.services import sales_metrics
from sales.models import Sale, SaleLine, SaleRefund
from sales.services import complete_sale, return_sale_lines, void_sale


@pytest.fixture
def cashier(db):
    u = User.objects.create_user(username="fix_cashier", password="pass12345")
    u.profile.role = "CASHIER"
    u.profile.save(update_fields=["role"])
    return u


def _mk_variant(*, barcode: str, stock: int = 10, list_price="100000", purchase="50000"):
    cat = Category.objects.create(name_uz="Cat", name_ru="Cat")
    prod = Product.objects.create(category=cat, name_uz="Phone", name_ru="Phone")
    return ProductVariant.objects.create(
        product=prod,
        purchase_price=Decimal(purchase),
        list_price=Decimal(list_price),
        stock_qty=stock,
        barcode=barcode,
    )


@pytest.mark.django_db
def test_line_discount_line_total_matches_grand_total(cashier):
    """qty bo'linmaydigan line_discount — line_total va grand_total bir xil bo'lsin."""
    variant = _mk_variant(barcode="BC-DISC-ROUND", stock=5, list_price="100000")
    sale = complete_sale(
        idempotency_key=str(uuid.uuid4()),
        cashier=cashier,
        lines=[
            {
                "variant_id": str(variant.id),
                "qty": 3,
                "line_discount": "1",
                "unit_price": "100000",
            }
        ],
        payments=[{"method": "CASH", "amount": "299999"}],
        expected_grand_total=Decimal("299999"),
        customer=None,
    )
    assert sale.grand_total == Decimal("299999")
    assert sale.subtotal == Decimal("300000")
    assert sale.discount_total == Decimal("1")
    ln = SaleLine.objects.get(sale=sale)
    assert ln.line_total == Decimal("299999")
    assert ln.line_total == sale.grand_total


@pytest.mark.django_db
def test_supplier_credit_memo_reduces_balance(db):
    supplier = Supplier.objects.create(name_uz="Post", name_ru="Post")
    SupplierTransaction.objects.create(
        supplier=supplier,
        type=SupplierTransaction.Type.PURCHASE,
        amount=Decimal("1000000"),
    )
    SupplierTransaction.objects.create(
        supplier=supplier,
        type=SupplierTransaction.Type.CREDIT_MEMO,
        amount=Decimal("200000"),
    )
    bal = get_supplier_balance(str(supplier.id))
    assert bal["total_debt"] == Decimal("1000000")
    assert bal["total_paid"] == Decimal("200000")
    assert bal["balance"] == Decimal("800000")


@pytest.mark.django_db
def test_void_after_partial_debt_payment_refunds_cash_for_paid(cashier):
    """Qarz qisman to'langandan keyin void — to'lov naqd qaytarilsin."""
    variant = _mk_variant(barcode="BC-DEBT-VOID", stock=5, list_price="100000", purchase="50000")
    customer = Customer.objects.create(name="Vali", phone_normalized="998901110011")
    sale = complete_sale(
        idempotency_key=str(uuid.uuid4()),
        cashier=cashier,
        lines=[{"variant_id": str(variant.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "DEBT", "amount": "100000"}],
        customer={
            "name": customer.name,
            "phone_normalized": customer.phone_normalized,
        },
    )
    debt = Debt.objects.get(originating_sale=sale)
    record_debt_payment(customer=customer, amount=Decimal("40000"), user=cashier)
    debt.refresh_from_db()
    assert debt.paid_amount == Decimal("40000")
    assert debt.remaining_amount == Decimal("60000")

    out = void_sale(sale=sale, user=cashier, reason="debt void")
    sale.refresh_from_db()
    debt.refresh_from_db()
    variant.refresh_from_db()

    assert sale.status == Sale.Status.VOIDED
    assert debt.status == Debt.Status.VOIDED
    assert debt.remaining_amount == Decimal("0")
    assert variant.stock_qty == 5
    assert Decimal(out["return_amount"]) == Decimal("100000")
    methods = {r["method"]: Decimal(r["amount"]) for r in out["refunds"]}
    assert methods.get("DEBT", Decimal(0)) == Decimal("60000")
    assert methods.get("CASH", Decimal(0)) == Decimal("40000")
    assert (
        SaleRefund.objects.filter(sale=sale, method="CASH").aggregate(t=Sum("amount"))["t"]
        == Decimal("40000")
    )


@pytest.mark.django_db
def test_void_bonus_only_remaining_restocks(cashier):
    """Pullik qator vozvrat qilingan, faqat bonus qolgan — void bonusni qaytarsin."""
    paid = _mk_variant(barcode="BC-BONUS-PAID", stock=5, list_price="150000", purchase="100000")
    cat = Category.objects.create(name_uz="Aks", name_ru="Aks")
    prod = Product.objects.create(category=cat, name_uz="Chexol", name_ru="Чехол")
    bonus = ProductVariant.objects.create(
        product=prod,
        purchase_price=Decimal("10000"),
        list_price=Decimal("50000"),
        stock_qty=3,
        barcode="BC-BONUS-ONLY",
    )
    sale = complete_sale(
        idempotency_key=str(uuid.uuid4()),
        cashier=cashier,
        lines=[
            {
                "variant_id": str(paid.id),
                "qty": 1,
                "line_discount": "0",
                "unit_price": "150000",
            },
            {
                "variant_id": str(bonus.id),
                "qty": 1,
                "line_discount": "0",
                "unit_price": "50000",
                "is_bonus": True,
            },
        ],
        payments=[{"method": "CASH", "amount": "150000"}],
        customer=None,
    )
    return_sale_lines(
        sale=sale,
        user=cashier,
        lines=[{"variant_id": str(paid.id), "qty": 1}],
        reason="return paid",
    )
    bonus.refresh_from_db()
    assert bonus.stock_qty == 2

    out = void_sale(sale=sale, user=cashier, reason="bonus left")
    sale.refresh_from_db()
    bonus.refresh_from_db()
    assert sale.status == Sale.Status.VOIDED
    assert bonus.stock_qty == 3
    assert out["restocked_lines"] == [{"variant_id": str(bonus.id), "qty": 1}]
    assert out["return_amount"] == "0"


@pytest.mark.django_db
def test_gross_profit_uses_attributed_returns_not_return_date(cashier):
    """Boshqa kundagi vozvrat ham shu sotuv davri foydasidan ayiriladi."""
    variant = _mk_variant(
        barcode="BC-ACCRUAL-GP", stock=5, list_price="150000", purchase="100000"
    )
    sale = complete_sale(
        idempotency_key=str(uuid.uuid4()),
        cashier=cashier,
        lines=[{"variant_id": str(variant.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "CASH", "amount": "150000"}],
        customer=None,
    )
    yesterday = timezone.localdate() - timedelta(days=1)
    Sale.objects.filter(pk=sale.pk).update(
        completed_at=timezone.make_aware(datetime.combine(yesterday, time(12, 0)))
    )
    return_sale_lines(
        sale=sale,
        user=cashier,
        lines=[{"variant_id": str(variant.id), "qty": 1}],
        reason="next day return",
    )
    m = sales_metrics(from_date=str(yesterday), to_date=str(yesterday))
    assert str(m["sales_amount"]) == "150000"
    assert str(m["returned_total_attributed"]) == "150000"
    assert str(m["gross_profit"]) == "0"
    assert str(m["cash_total"]) == "0"
    today = timezone.localdate()
    m_today = sales_metrics(from_date=str(today), to_date=str(today))
    assert str(m_today["sales_amount"]) == "0"
    assert Decimal(str(m_today["refund_total"])) == Decimal("150000")
    assert str(m_today["gross_profit"]) == "0"
