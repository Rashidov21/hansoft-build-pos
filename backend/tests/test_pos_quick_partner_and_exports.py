"""Test Z-report enhancement and Expenses XLSX/PDF exports."""

import uuid
from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from catalog.models import Category, Product, ProductVariant
from expenses.models import ShopExpense
from integrations.services import _build_z_report_text, _build_z_report_whatsapp_text
from reports.services import sales_metrics
from sales.services import complete_sale


@pytest.fixture
def owner(db):
    u = User.objects.create_user(username="owner_user", password="pass12345")
    u.profile.role = "OWNER"
    u.profile.save(update_fields=["role"])
    return u


@pytest.fixture
def cashier(db):
    u = User.objects.create_user(username="cashier_user", password="pass12345")
    u.profile.role = "CASHIER"
    u.profile.save(update_fields=["role"])
    return u


def _mk_variant(*, barcode: str, list_price: str = "300000", stock: str = "10"):
    cat = Category.objects.create(name_uz="Asal", name_ru="Мёд")
    prod = Product.objects.create(category=cat, name_uz="Gul asali", name_ru="Gul asali")
    return ProductVariant.objects.create(
        product=prod,
        purchase_price=Decimal("95000"),
        list_price=Decimal(list_price),
        stock_qty=Decimal(stock),
        barcode=barcode,
    )


@pytest.mark.django_db
def test_z_report_includes_expenses_breakdown_and_cashflow(cashier):
    """Z-Report text contains category breakdown and cash net flow."""
    variant = _mk_variant(barcode="9988776655", list_price="400000", stock="5")

    complete_sale(
        idempotency_key=str(uuid.uuid4()),
        cashier=cashier,
        lines=[{"variant_id": str(variant.id), "qty": "1"}],
        payments=[{"method": "CASH", "amount": "400000"}],
        customer=None,
        expected_grand_total=Decimal("400000"),
    )

    ShopExpense.objects.create(
        recorded_by=cashier,
        amount=Decimal("50000"),
        category=ShopExpense.Category.RENT,
        note="Do'kon ijarasi",
    )
    ShopExpense.objects.create(
        recorded_by=cashier,
        amount=Decimal("20000"),
        category=ShopExpense.Category.UTILITIES,
        note="Elektr energiyasi",
    )

    metrics = sales_metrics()
    assert metrics["today_expense_total"] == Decimal("70000")
    assert "RENT" in metrics["today_expenses_by_category"]
    assert "UTILITIES" in metrics["today_expenses_by_category"]
    assert metrics["today_cash_net_flow"] == Decimal("400000") - Decimal("70000")

    tg_uz = _build_z_report_text(metrics=metrics, lang="uz")
    assert "Kassa naqd pul oqimi:" in tg_uz
    assert "Ijara" in tg_uz
    assert "Sherik mollaridan foyda" not in tg_uz

    wa_uz = _build_z_report_whatsapp_text(metrics=metrics, lang="uz")
    assert "*Z-Report*" in wa_uz
    assert "*Kassadagi sof naqd:*" in wa_uz
    assert "*Yalpi foyda:*" in wa_uz


@pytest.mark.django_db
def test_expenses_export_xlsx_and_pdf(owner, cashier):
    """Expenses XLSX and PDF endpoints return 200 with proper content and headers."""
    client = APIClient()
    client.force_authenticate(user=owner)

    ShopExpense.objects.create(
        recorded_by=cashier,
        amount=Decimal("150000"),
        category=ShopExpense.Category.SALARY,
        note="Avans xodimga",
    )
    ShopExpense.objects.create(
        recorded_by=cashier,
        amount=Decimal("80000"),
        category=ShopExpense.Category.SUPPLIES,
        note="Kantselyariya va chek lentasi",
    )

    r_xlsx = client.get("/api/expenses/export/xlsx/?lang=uz")
    assert r_xlsx.status_code == 200
    assert "spreadsheetml.sheet" in r_xlsx["Content-Type"]
    assert "attachment; filename=" in r_xlsx["Content-Disposition"]
    assert len(r_xlsx.content) > 100

    r_pdf = client.get("/api/expenses/export/pdf/?lang=uz")
    assert r_pdf.status_code == 200
    assert "application/pdf" in r_pdf["Content-Type"]
    assert "attachment; filename=" in r_pdf["Content-Disposition"]
    assert r_pdf.content.startswith(b"%PDF-")

    r_filter = client.get("/api/expenses/export/xlsx/?category=SALARY")
    assert r_filter.status_code == 200
    assert len(r_filter.content) > 100


@pytest.mark.django_db
def test_cashier_forbidden_for_exports(cashier):
    """Cashier should receive 403 Forbidden on expense export endpoints."""
    client = APIClient()
    client.force_authenticate(user=cashier)

    r_xlsx = client.get("/api/expenses/export/xlsx/")
    assert r_xlsx.status_code == 403

    r_pdf = client.get("/api/expenses/export/pdf/")
    assert r_pdf.status_code == 403
