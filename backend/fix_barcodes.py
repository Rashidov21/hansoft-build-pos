import os
import sys

import django
from django.db import transaction

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from catalog.barcodes import BARCODE_START
from catalog.models import ProductVariant


def migrate_numeric_barcodes():
    rows = ProductVariant.objects.order_by("created_at", "id")
    used = set(ProductVariant.objects.exclude(barcode__isnull=True).values_list("barcode", flat=True))
    next_num = BARCODE_START
    changed = 0
    with transaction.atomic():
        for row in rows:
            if row.barcode and row.barcode.isdigit() and len(row.barcode) == 8:
                next_num = max(next_num, int(row.barcode) + 1)
                continue
            while str(next_num) in used:
                next_num += 1
            old = row.barcode
            row.barcode = str(next_num)
            row.save(update_fields=["barcode"])
            used.add(row.barcode)
            print(f"{row.id}: {old} -> {row.barcode}")
            changed += 1
            next_num += 1
    print(f"Done. updated={changed}")


if __name__ == "__main__":
    try:
        migrate_numeric_barcodes()
    except Exception as exc:
        print(f"error: {exc}")
        sys.exit(1)
