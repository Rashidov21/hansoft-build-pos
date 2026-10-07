"""
Management command: push completed sales to CLOUD_PUSH_URL (Phase 3).

Usage:
  set CLOUD_PUSH_URL=https://example.com/api/ingest/
  python manage.py push_sales
"""
import json
import os
import urllib.error
import urllib.request

from django.core.management.base import BaseCommand
from django.utils import timezone

from printing.receipt import sale_to_receipt_dict
from sales.models import Sale


class Command(BaseCommand):
    help = "Push unsynced completed sales to CLOUD_PUSH_URL"

    def handle(self, *args, **options):
        url = os.environ.get("CLOUD_PUSH_URL", "").strip()
        if not url:
            self.stderr.write("CLOUD_PUSH_URL not set")
            return

        pending = Sale.objects.filter(
            status=Sale.Status.COMPLETED, exported_at__isnull=True
        )
        pushed = 0
        for sale in pending.iterator():
            payload = json.dumps(sale_to_receipt_dict(sale)).encode("utf-8")
            try:
                req = urllib.request.Request(
                    url,
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                urllib.request.urlopen(req, timeout=15)
            except urllib.error.URLError as e:
                sale.export_last_error = str(e)
                sale.save(update_fields=["export_last_error"])
                self.stderr.write(f"Sale {sale.id} failed: {e}")
                continue
            sale.exported_at = timezone.now()
            sale.export_last_error = ""
            sale.save(update_fields=["exported_at", "export_last_error"])
            pushed += 1
        self.stdout.write(self.style.SUCCESS(f"Pushed {pushed} sales"))
