"""Wholesale (ulgurji) price field on variants."""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from accounts.models import Role, UserProfile
from catalog.models import Category, Product, ProductVariant
from core.qty import UNIT_DONA


@pytest.fixture
def variant_with_wholesale(db):
    cat = Category.objects.create(name_uz="Cat", name_ru="Cat")
    product = Product.objects.create(category=cat, name_uz="Sement", name_ru="Cement")
    return ProductVariant.objects.create(
        product=product,
        unit=UNIT_DONA,
        purchase_price=Decimal("40000"),
        list_price=Decimal("50000"),
        wholesale_price=Decimal("47000"),
        stock_qty=Decimal("100"),
    )


@pytest.mark.django_db
def test_wholesale_price_stored(variant_with_wholesale):
    v = variant_with_wholesale
    assert v.wholesale_price == Decimal("47000")
    assert v.list_price == Decimal("50000")


@pytest.mark.django_db
def test_wholesale_price_optional(db):
    cat = Category.objects.create(name_uz="Cat", name_ru="Cat")
    product = Product.objects.create(category=cat, name_uz="G'isht", name_ru="Brick")
    v = ProductVariant.objects.create(
        product=product,
        unit=UNIT_DONA,
        purchase_price=Decimal("1000"),
        list_price=Decimal("1500"),
        stock_qty=Decimal("10"),
    )
    assert v.wholesale_price is None


@pytest.mark.django_db
def test_pos_serializer_includes_wholesale(variant_with_wholesale):
    from catalog.serializers import PosProductVariantSerializer
    from rest_framework.test import APIRequestFactory
    from rest_framework.request import Request

    User = get_user_model()
    user = User.objects.create_user(username="c1_wholesale", password="x")
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.role = Role.CASHIER
    profile.save(update_fields=["role"])
    factory = APIRequestFactory()
    req = Request(factory.get("/"))
    req.user = user
    data = PosProductVariantSerializer(
        variant_with_wholesale, context={"request": req}
    ).data
    assert data["list_price"] == "50000.00"
    assert data["wholesale_price"] == "47000.00"
    assert "purchase_price" not in data
