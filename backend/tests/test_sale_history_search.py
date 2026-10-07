import pytest
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APIClient

from catalog.models import Category, Product, ProductVariant
from sales.services import complete_sale


def _mk_user(username: str, role: str) -> User:
    u = User.objects.create_user(username=username, password="pass12345")
    u.profile.role = role
    u.profile.save(update_fields=["role"])
    return u


@pytest.mark.django_db
def test_sale_history_search_by_receipt_product_fields():
    owner = _mk_user("hist_search_owner", "OWNER")
    cashier = _mk_user("hist_search_cash", "CASHIER")
    brand = Category.objects.create(name_uz="Samsung Brend", name_ru="Samsung Brend")
    prod = Product.objects.create(
        category=brand,
        name_uz="Galaxy Model",
        name_ru="Galaxy Model",
        custom_name_uz="Chekda ko'rinadigan nom",
        custom_name_ru="Chekda ko'rinadigan nom",
    )
    variant = ProductVariant.objects.create(
        product=prod,
        purchase_price=Decimal("100000"),
        list_price=Decimal("150000"),
        stock_qty=5,
        barcode="BC-HIST-SEARCH-1",
    )
    sale = complete_sale(
        idempotency_key="hist-search-1",
        cashier=cashier,
        lines=[{"variant_id": str(variant.id), "qty": 1, "line_discount": "0"}],
        payments=[{"method": "CASH", "amount": "150000"}],
        customer=None,
    )

    api = APIClient()
    api.force_authenticate(user=owner)

    for q in ("Samsung Brend", "Galaxy Model", "Chekda ko'rinadigan nom", "BC-HIST-SEARCH-1"):
        r = api.get("/api/sales/", {"q": q})
        assert r.status_code == 200, q
        ids = {row["id"] for row in r.json()["results"]}
        assert str(sale.id) in ids, q

    r_miss = api.get("/api/sales/", {"q": "boshqa-tovar"})
    assert r_miss.status_code == 200
    assert str(sale.id) not in {row["id"] for row in r_miss.json()["results"]}
