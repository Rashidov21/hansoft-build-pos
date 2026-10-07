#!/usr/bin/env python3
"""Clear catalog/sales data and seed honey shop (Asal) demo data.

Prices are per unit: sum/kg for honey (unit=kg), sum/dona for bee products.
Stock is in the same unit (kg may be fractional, e.g. 12.5).
"""
import os
from decimal import Decimal

import django

# Avoid starting long-lived scheduler threads during seeding.
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
from core.qty import UNIT_DONA, UNIT_KG
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


# (name_uz, name_ru, purchase_price/kg, list_price/kg, stock_kg)
HONEY_VARIETIES = [
    ("Gul asali", "Цветочный мёд", "95000", "130000", "25"),
    ("Paxta asali", "Хлопковый мёд", "85000", "115000", "30"),
    ("Akatsiya asali", "Акациевый мёд", "120000", "165000", "18.5"),
    ("O'rmon asali", "Лесной мёд", "110000", "150000", "20"),
    ("Tog' asali", "Горный мёд", "180000", "240000", "12.5"),
    ("Dorivor o'tlar asali", "Мёд из лекарственных трав", "130000", "175000", "14"),
    ("Yo'ng'oq (beda) asali", "Люцерновый мёд", "100000", "140000", "16"),
    ("Mayin asal (kremli)", "Кремовый мёд", "115000", "155000", "10"),
    ("Kashtan asali", "Каштановый мёд", "150000", "200000", "8"),
    ("Qora zira asali", "Мёд с чёрным тмином", "140000", "190000", "9.5"),
]

# (name_uz, name_ru, purchase_price/dona, list_price/dona, stock_dona)
BEE_PRODUCTS = [
    ("Ari mumi (100 g)", "Пчелиный воск (100 г)", "25000", "40000", "40"),
    ("Propolis tincturasi 30 ml", "Настойка прополиса 30 мл", "30000", "50000", "30"),
    ("Asalli shona (ramka)", "Соты в рамке", "60000", "95000", "12"),
    ("Gul changi (100 g)", "Цветочная пыльца (100 г)", "35000", "55000", "25"),
    ("Ari suti (10 g)", "Маточное молочко (10 г)", "70000", "110000", "10"),
]


def seed_honey_data():
    print("Seeding honey shop data...")
    with transaction.atomic():
        cat_honey = ProductCategory.objects.create(
            name_uz="Asal", name_ru="Мёд", sort_order=0
        )
        cat_bee = ProductCategory.objects.create(
            name_uz="Ari mahsulotlari", name_ru="Продукты пчеловодства", sort_order=1
        )
        # Product.category is required; single default bucket for the simplified model.
        default_cat = Category.objects.create(
            name_uz="Category", name_ru="Category", sort_order=0
        )

        variant_count = 0

        for name_uz, name_ru, buy, sell, stock in HONEY_VARIETIES:
            product = Product.objects.create(
                category=default_cat,
                product_category=cat_honey,
                name_uz=name_uz,
                name_ru=name_ru,
            )
            ProductVariant.objects.create(
                product=product,
                barcode=None,
                unit=UNIT_KG,
                purchase_price=Decimal(buy),
                list_price=Decimal(sell),
                stock_qty=Decimal(stock),
            )
            variant_count += 1

        for name_uz, name_ru, buy, sell, stock in BEE_PRODUCTS:
            product = Product.objects.create(
                category=default_cat,
                product_category=cat_bee,
                name_uz=name_uz,
                name_ru=name_ru,
            )
            ProductVariant.objects.create(
                product=product,
                barcode=None,
                unit=UNIT_DONA,
                purchase_price=Decimal(buy),
                list_price=Decimal(sell),
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

        settings = StoreSettings.get_solo()
        settings.brand_name = "Hansoft POS"
        settings.phone = "+998 90 123 45 67"
        settings.address = "Toshkent"
        # Low stock alert in kg / dona (Decimal)
        settings.low_stock_threshold = Decimal("2")
        settings.auto_print_on_sale = False
        settings.receipt_printing_enabled = False
        settings.save()
        print(f"Created {variant_count} variants (honey: kg, bee products: dona)")

    print("Seed complete")


if __name__ == "__main__":
    import sys

    print("=" * 60)
    print("Hansoft POS - Clear & Seed Honey Shop Data")
    print("=" * 60)
    auto = "--yes" in sys.argv or "-y" in sys.argv
    if not auto:
        response = input("This will DELETE ALL DATA. Continue? (yes/no): ")
        if response.lower() != "yes":
            print("Cancelled.")
            raise SystemExit(0)
    clear_all_data()
    seed_honey_data()
    print("Done.")
    print("Login: admin/admin123 (PIN 1111) or cashier/pass12345 (PIN 1111)")
