import pytest
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APIClient

from catalog.models import Category, Product, ProductVariant


def _mk_admin() -> User:
    u = User.objects.create_user(username="cat_del_admin", password="pass12345")
    u.profile.role = "OWNER"
    u.profile.save(update_fields=["role"])
    return u


@pytest.mark.django_db
def test_product_soft_delete_hides_variants_from_catalog_list():
    admin = _mk_admin()
    brand = Category.objects.create(name_uz="B", name_ru="B")
    product = Product.objects.create(category=brand, name_uz="M1", name_ru="M1")
    variant = ProductVariant.objects.create(
        product=product,
        purchase_price=Decimal("100000"),
        list_price=Decimal("150000"),
        stock_qty=3,
        barcode="BC-CAT-DEL-1",
    )

    api = APIClient()
    api.force_authenticate(user=admin)

    r0 = api.get("/api/catalog/variants/")
    assert r0.status_code == 200
    assert any(row["id"] == str(variant.id) for row in r0.json()["results"])

    dr = api.delete(f"/api/catalog/products/{product.id}/")
    assert dr.status_code == 200

    variant.refresh_from_db()
    product.refresh_from_db()
    assert product.deleted_at is not None
    assert variant.deleted_at is not None

    r1 = api.get("/api/catalog/variants/")
    assert r1.status_code == 200
    assert not any(row["id"] == str(variant.id) for row in r1.json()["results"])

    rr = api.post(f"/api/catalog/products/{product.id}/restore/")
    assert rr.status_code == 200
    variant.refresh_from_db()
    assert variant.deleted_at is None

    r2 = api.get("/api/catalog/variants/")
    assert any(row["id"] == str(variant.id) for row in r2.json()["results"])
