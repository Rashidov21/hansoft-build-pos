#!/usr/bin/env python3
"""Clear catalog/sales data and seed construction-materials (qurilish mollari) demo data.

Units: dona / kg / m / qop. Optional wholesale_price on some variants.
"""
import os
from decimal import Decimal

import django

os.environ.setdefault("ENABLE_AUTO_BACKUP", "0")
os.environ.setdefault("ENABLE_AUTO_Z_SCHEDULER", "0")
os.environ.setdefault("ENABLE_AUTO_DEBT_REMINDER", "0")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.db import transaction

from accounts.models import Role, UserProfile
from catalog.models import Category, Product, ProductCategory, ProductVariant
from core.qty import UNIT_DONA, UNIT_KG, UNIT_M, UNIT_QOP
from printing.models import StoreSettings

User = get_user_model()


def clear_all_data():
    print("Clearing all data...")
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute("PRAGMA foreign_keys=OFF")
    try:
        with transaction.atomic():
            from catalog.models import (
                SupplierReceipt,
                SupplierReceiptLine,
                SupplierTransaction,
            )
            from debt.models import Debt
            from expenses.models import Shift, ShopExpense
            from inventory.models import InventoryMovement, StocktakeLine, StocktakeSession
            from sales.models import Sale, SaleLine, SaleRefund

            SaleRefund.objects.all().delete()
            Debt.objects.all().delete()
            SaleLine.objects.all().delete()
            Sale.objects.all().delete()
            InventoryMovement.objects.all().delete()
            StocktakeLine.objects.all().delete()
            StocktakeSession.objects.all().delete()
            ShopExpense.objects.all().delete()
            Shift.objects.all().delete()
            SupplierReceiptLine.objects.all().delete()
            SupplierReceipt.objects.all().delete()
            SupplierTransaction.objects.all().delete()
            ProductVariant.objects.all().delete()
            Product.objects.all().delete()
            ProductCategory.objects.all().delete()
            Category.objects.all().delete()
            User.objects.filter(is_superuser=False).delete()
    finally:
        with connection.cursor() as cursor:
            cursor.execute("PRAGMA foreign_keys=ON")
    print("Database cleared")


# (name_uz, name_ru, unit, purchase, list, wholesale|None, stock)
BUILD_ITEMS = [
    # Cement / binders — qop
    ("Sement M400 (50 kg)", "Цемент М400 (50 кг)", UNIT_QOP, "55000", "68000", "62000", "120"),
    ("Sement M500 (50 kg)", "Цемент М500 (50 кг)", UNIT_QOP, "62000", "75000", "70000", "80"),
    ("Ohak (25 kg)", "Известь (25 кг)", UNIT_QOP, "18000", "25000", None, "60"),
    # Bulk — kg
    ("Qum (quruq)", "Песок (сухой)", UNIT_KG, "120", "200", "160", "5000"),
    ("Shag'al 5-20", "Щебень 5-20", UNIT_KG, "150", "250", "200", "4000"),
    ("Gips aralashma", "Гипсовая смесь", UNIT_KG, "3500", "5200", "4800", "800"),
    # Piece goods — dona
    ("G'isht qizil", "Кирпич красный", UNIT_DONA, "1200", "1800", "1500", "5000"),
    ("Gazoblok 20x30x60", "Газоблок 20x30x60", UNIT_DONA, "18000", "24000", "22000", "400"),
    ("Plitka 30x30 (dona)", "Плитка 30x30 (шт)", UNIT_DONA, "8000", "12000", None, "600"),
    ("Rozetka oddiy", "Розетка обычная", UNIT_DONA, "15000", "25000", None, "80"),
    ("Kalit (vyklyuchatel)", "Выключатель", UNIT_DONA, "14000", "22000", None, "70"),
    # Length — m
    ("Armatura 12 mm", "Арматура 12 мм", UNIT_M, "9000", "13000", "11500", "500"),
    ("Profil truba 20x20", "Профильная труба 20x20", UNIT_M, "12000", "18000", "16000", "300"),
    ("Kabel VVG 2x1.5", "Кабель ВВГ 2x1.5", UNIT_M, "3500", "5500", "5000", "1000"),
    ("Polietilen truba 20", "Полиэтиленовая труба 20", UNIT_M, "4000", "6500", None, "800"),
]


def seed_build_data():
    print("Seeding construction-materials catalog...")
    with transaction.atomic():
        cat_cement = ProductCategory.objects.create(
            name_uz="Sement va bog'lovchi", name_ru="Цемент и вяжущие", sort_order=0
        )
        cat_bulk = ProductCategory.objects.create(
            name_uz="Qum / shag'al", name_ru="Песок / щебень", sort_order=1
        )
        cat_wall = ProductCategory.objects.create(
            name_uz="Devor materiallari", name_ru="Стеновые материалы", sort_order=2
        )
        cat_metal = ProductCategory.objects.create(
            name_uz="Metall va profil", name_ru="Металл и профиль", sort_order=3
        )
        cat_electro = ProductCategory.objects.create(
            name_uz="Elektrika", name_ru="Электрика", sort_order=4
        )
        cat_pipe = ProductCategory.objects.create(
            name_uz="Quvurlar", name_ru="Трубы", sort_order=5
        )

        default_cat = Category.objects.create(
            name_uz="Category", name_ru="Category", sort_order=0
        )

        def pick_pc(name_uz: str, unit: str) -> ProductCategory:
            n = name_uz.lower()
            if "qum" in n or "shag" in n or "gips" in n:
                return cat_bulk
            if "sement" in n or "ohak" in n:
                return cat_cement
            if "g'isht" in n or "gazoblok" in n or "plitka" in n:
                return cat_wall
            if "armatura" in n or "profil" in n:
                return cat_metal
            if "kabel" in n or "rozetka" in n or "kalit" in n:
                return cat_electro
            if "truba" in n:
                return cat_pipe
            if unit == UNIT_M:
                return cat_metal
            if unit == UNIT_QOP:
                return cat_cement
            return cat_wall

        variant_count = 0
        for name_uz, name_ru, unit, buy, sell, wholesale, stock in BUILD_ITEMS:
            product = Product.objects.create(
                category=default_cat,
                product_category=pick_pc(name_uz, unit),
                name_uz=name_uz,
                name_ru=name_ru,
            )
            ProductVariant.objects.create(
                product=product,
                barcode=None,
                unit=unit,
                purchase_price=Decimal(buy),
                list_price=Decimal(sell),
                wholesale_price=Decimal(wholesale) if wholesale else None,
                stock_qty=Decimal(stock),
            )
            variant_count += 1

        if not User.objects.filter(username="admin").exists():
            admin = User.objects.create_user(username="admin", password="admin123")
            profile, _ = UserProfile.objects.get_or_create(user=admin)
            profile.role = Role.ADMIN
            profile.pin_enabled = True
            profile.pin_hash = make_password("1111")
            profile.save()
            print("Created admin (admin/admin123, PIN 1111)")

        if not User.objects.filter(username="cashier").exists():
            cashier = User.objects.create_user(username="cashier", password="pass12345")
            profile, _ = UserProfile.objects.get_or_create(user=cashier)
            profile.role = Role.CASHIER
            profile.pin_enabled = True
            profile.pin_hash = make_password("1111")
            profile.save()
            print("Created cashier (cashier/pass12345, PIN 1111)")

        if not User.objects.filter(username="owner").exists():
            owner = User.objects.create_user(username="owner", password="owner123")
            profile, _ = UserProfile.objects.get_or_create(user=owner)
            profile.role = Role.OWNER
            profile.pin_enabled = True
            profile.pin_hash = make_password("1111")
            profile.save()
            print("Created owner (owner/owner123, PIN 1111)")

        settings = StoreSettings.get_solo()
        settings.brand_name = "Hansoft POS"
        settings.phone = "+998 90 123 45 67"
        settings.address = "Toshkent — qurilish mollari"
        settings.footer_note = "Xaridingiz uchun rahmat!"
        settings.low_stock_threshold = Decimal("5")
        settings.auto_print_on_sale = False
        settings.receipt_printing_enabled = False
        settings.save()
        print(f"Created {variant_count} variants (dona/kg/m/qop)")

    print("Seed complete")


if __name__ == "__main__":
    import sys

    print("=" * 60)
    print("Hansoft POS - Clear & Seed Build Materials")
    print("=" * 60)
    auto = "--yes" in sys.argv or "-y" in sys.argv
    if not auto:
        response = input("This will DELETE ALL DATA. Continue? (yes/no): ")
        if response.lower() != "yes":
            print("Cancelled.")
            raise SystemExit(0)
    clear_all_data()
    seed_build_data()
    print("Done.")
    print("Login: admin/admin123, cashier/pass12345, owner/owner123 — PIN 1111")
