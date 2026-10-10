"""B1: default_label_size, label name fallback, test-label mock."""
import base64
from types import SimpleNamespace

import pytest
from django.contrib.auth.models import User

from catalog.models import Category, Product, ProductVariant
from printing.models import StoreSettings
from printing.receipt import (
    _label_custom_name,
    cyrillic_to_latin,
    prepare_tspl_label_text,
    resolve_label_size,
    resolve_receipt_render_mode,
)
from printing.services import PrinterFactory


def _mk_user(username: str, role: str) -> User:
    u = User.objects.create_user(username=username, password="pass12345")
    u.profile.role = role
    u.profile.save(update_fields=["role"])
    return u


def _mk_variant(*, name_uz: str = "Armatura 12 mm", custom_uz: str = "") -> ProductVariant:
    cat = Category.objects.create(name_uz="Metall", name_ru="Металл")
    prod = Product.objects.create(
        category=cat,
        name_uz=name_uz,
        name_ru=name_uz,
        custom_name_uz=custom_uz,
        custom_name_ru=custom_uz,
    )
    return ProductVariant.objects.create(
        product=prod,
        purchase_price="100000.00",
        list_price="150000.00",
        stock_qty=10,
        barcode="BC-LABEL-01",
    )


@pytest.mark.django_db
def test_resolve_label_size_uses_store_default():
    settings = StoreSettings.get_solo()
    settings.default_label_size = "40x50"
    settings.save(update_fields=["default_label_size"])
    assert resolve_label_size(settings, None) == "40x50"
    assert resolve_label_size(settings, "") == "40x50"
    assert resolve_label_size(settings, "30x20") == "30x20"
    assert resolve_label_size(settings, "bogus") == "40x50"


@pytest.mark.django_db
def test_label_name_falls_back_to_catalog_name():
    product = SimpleNamespace(
        custom_name_uz="",
        custom_name_ru="",
        custom_name_uz_cyrillic="",
        name_uz="Armatura 12 mm",
        name_ru="Арматура 12 мм",
        name_uz_cyrillic="",
    )
    assert _label_custom_name(product, "uz") == "Armatura 12 mm"
    assert _label_custom_name(product, "ru") == "Арматура 12 мм"
    product.custom_name_uz = "Custom UZ"
    assert _label_custom_name(product, "uz") == "Custom UZ"


@pytest.mark.django_db
def test_label_escpos_omitted_size_uses_default(client):
    owner = _mk_user("owner_label_def", "OWNER")
    variant = _mk_variant()
    settings = StoreSettings.get_solo()
    settings.label_printer_type = "TSPL"
    settings.default_label_size = "40x50"
    settings.save(update_fields=["label_printer_type", "default_label_size"])
    client.force_login(owner)
    r = client.post(
        "/api/printing/labels/escpos/",
        data={"variant_id": str(variant.id), "copies": 1},
        content_type="application/json",
    )
    assert r.status_code == 200
    body = r.json()
    assert body["size"] == "40x50"
    raw = base64.b64decode(body["raw_base64"]).decode("ascii", errors="ignore")
    assert "SIZE 40 mm,50 mm" in raw
    assert "Armatura" in raw or "ARMATURA" in raw.upper() or "12" in raw

    blank = client.post(
        "/api/printing/labels/escpos/",
        data={"variant_id": str(variant.id), "size": "", "copies": 1},
        content_type="application/json",
    )
    assert blank.status_code == 200
    assert blank.json()["size"] == "40x50"


@pytest.mark.django_db
def test_test_label_includes_name_and_store_default_size(client):
    owner = _mk_user("owner_test_label", "OWNER")
    settings = StoreSettings.get_solo()
    settings.label_printer_type = "TSPL"
    settings.default_label_size = "40x30"
    settings.transliterate_uz = True
    settings.save(update_fields=["label_printer_type", "default_label_size", "transliterate_uz"])
    client.force_login(owner)
    r = client.post("/api/printing/test-label/", data={}, content_type="application/json")
    assert r.status_code == 200
    body = r.json()
    assert body["size"] == "40x30"
    raw = base64.b64decode(body["raw_base64"]).decode("ascii", errors="ignore")
    assert "SIZE 40 mm,30 mm" in raw
    assert "Demo" in raw
    assert "BARCODE" in raw
    assert "TEST123456" in raw


@pytest.mark.django_db
def test_store_settings_exposes_label_defaults(client):
    owner = _mk_user("owner_settings_label", "OWNER")
    client.force_login(owner)
    r = client.get("/api/printing/settings/")
    assert r.status_code == 200
    body = r.json()
    assert body["default_label_size"] == "40x30"
    assert body["label_printing_enabled"] is True

    put = client.put(
        "/api/printing/settings/",
        data={
            "default_label_size": "30x20",
            "label_printing_enabled": False,
        },
        content_type="application/json",
    )
    assert put.status_code == 200
    assert put.json()["default_label_size"] == "30x20"
    assert put.json()["label_printing_enabled"] is False


@pytest.mark.django_db
def test_hardware_config_includes_label_defaults(client):
    cashier = _mk_user("cashier_hw_label", "CASHIER")
    client.force_login(cashier)
    r = client.get("/api/printing/hardware-config/")
    assert r.status_code == 200
    body = r.json()
    assert "default_label_size" in body
    assert "label_printing_enabled" in body


@pytest.mark.django_db
def test_tspl_renders_catalog_name_without_custom():
    settings = StoreSettings.get_solo()
    settings.label_printer_type = "TSPL"
    settings.transliterate_uz = True
    settings.save(update_fields=["label_printer_type", "transliterate_uz"])
    variant = _mk_variant(name_uz="Tsement M400", custom_uz="")
    raw = PrinterFactory.render_label(
        label_payload={"variant": variant, "size": "40x30", "copies": 1, "show_price": True},
        settings=settings,
    ).decode("ascii", errors="ignore")
    assert "SIZE 40 mm,30 mm" in raw
    assert "Tsement" in raw or "tsement" in raw.lower()
    assert "BARCODE" in raw


@pytest.mark.django_db
def test_receipt_render_mode_from_settings(monkeypatch):
    settings = StoreSettings.get_solo()
    settings.receipt_render_mode = "image"
    settings.save(update_fields=["receipt_render_mode"])
    monkeypatch.delenv("RECEIPT_RENDER_MODE", raising=False)
    assert resolve_receipt_render_mode(settings) == "image"
    settings.receipt_render_mode = "text"
    settings.save(update_fields=["receipt_render_mode"])
    assert resolve_receipt_render_mode(settings) == "text"
    monkeypatch.setenv("RECEIPT_RENDER_MODE", "image")
    assert resolve_receipt_render_mode(settings) == "image"


def test_cyrillic_to_latin_basic():
    assert "Armatura" in cyrillic_to_latin("Арматура")
    assert "Tsement" in cyrillic_to_latin("Цемент")
    assert prepare_tspl_label_text("Арматура 12 мм", max_len=28) != "-"
    assert "Armatura" in prepare_tspl_label_text("Арматура 12 мм", max_len=28)
    assert "o'" in prepare_tspl_label_text("Ғisht", max_len=28) or "G'" in prepare_tspl_label_text(
        "Ғisht", max_len=28
    )


@pytest.mark.django_db
def test_tspl_label_transliterates_cyrillic_name():
    settings = StoreSettings.get_solo()
    settings.label_printer_type = "TSPL"
    settings.receipt_lang = "ru"
    settings.transliterate_uz = False
    settings.save(update_fields=["label_printer_type", "receipt_lang", "transliterate_uz"])
    variant = _mk_variant(name_uz="Арматура 12 мм", custom_uz="")
    # Russian display name path
    variant.product.name_ru = "Арматура 12 мм"
    variant.product.name_uz = "Armatura 12 mm"
    variant.product.save(update_fields=["name_ru", "name_uz"])
    raw = PrinterFactory.render_label(
        label_payload={"variant": variant, "size": "40x30", "copies": 1, "show_price": False},
        settings=settings,
    ).decode("ascii", errors="ignore")
    assert "Armatura" in raw
    # Must not be empty placeholder only
    assert 'TEXT' in raw
    assert "Арматура" not in raw  # raw stream is ASCII
