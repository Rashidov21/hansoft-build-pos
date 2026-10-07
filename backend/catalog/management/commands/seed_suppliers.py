from decimal import Decimal
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from catalog.models import Supplier
from catalog.supplier_services import record_supplier_transaction


class Command(BaseCommand):
    help = "Create demo suppliers with transaction history for testing pagination"

    def handle(self, *args, **options):
        # Create suppliers
        suppliers_data = [
            {
                "name_uz": "Toshkent Optom",
                "name_ru": "Ташкент Оптом",
                "contact_person": "Alisher Karimov",
                "phone": "+998901234567",
                "address": "Toshkent, Chilonzor tumani",
            },
            {
                "name_uz": "Samarqand Savdo",
                "name_ru": "Самарканд Торговля",
                "contact_person": "Dilshod Rahimov",
                "phone": "+998902345678",
                "address": "Samarqand, Registon ko'chasi",
            },
            {
                "name_uz": "Buxoro Texnika",
                "name_ru": "Бухара Техника",
                "contact_person": "Rustam Yusupov",
                "phone": "+998903456789",
                "address": "Buxoro, Mustaqillik ko'chasi",
            },
        ]

        for supplier_data in suppliers_data:
            supplier, created = Supplier.objects.get_or_create(
                name_uz=supplier_data["name_uz"],
                defaults=supplier_data,
            )
            
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f"Created supplier: {supplier.name_uz}")
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f"Supplier already exists: {supplier.name_uz}")
                )

            # Create 25 transactions for testing pagination (10 per page = 3 pages)
            # Mix of purchases (debt) and payments
            base_date = timezone.now() - timedelta(days=60)
            
            for i in range(25):
                # Alternate between purchases and payments
                if i % 3 == 0:
                    # Payment
                    amount = Decimal(str(500000 + (i * 50000)))
                    tx_type = "PAYMENT"
                    note = f"To'lov #{i+1}"
                else:
                    # Purchase (debt)
                    amount = Decimal(str(1000000 + (i * 100000)))
                    tx_type = "PURCHASE"
                    note = f"Xarid #{i+1}"
                
                try:
                    record_supplier_transaction(
                        supplier_id=str(supplier.id),
                        transaction_type=tx_type,
                        amount=amount,
                        description_uz=note,
                        description_ru=note,
                        note=note,
                    )
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f"Error creating transaction: {e}")
                    )

            self.stdout.write(
                self.style.SUCCESS(
                    f"Created 25 transactions for {supplier.name_uz}"
                )
            )

        self.stdout.write(
            self.style.SUCCESS(
                "\n✓ Seed complete! Check Suppliers page to test pagination."
            )
        )
