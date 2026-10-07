import os

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner
from printing.receipt import sale_to_receipt_dict
from sales.models import Sale


class SyncPushView(APIView):
    """
    Phase 3 stub: POST unsynced sales to CLOUD_PUSH_URL if set.
    Marks exported_at on success (single-device, no conflict engine).
    """

    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        url = os.environ.get("CLOUD_PUSH_URL", "").strip()
        if not url:
            return Response({"detail": "CLOUD_PUSH_URL not configured", "pushed": 0})

        pending = Sale.objects.filter(
            status=Sale.Status.COMPLETED, exported_at__isnull=True
        )[:50]
        pushed = 0
        import urllib.error
        import urllib.request
        import json

        for sale in pending:
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
                continue
            sale.exported_at = timezone.now()
            sale.export_last_error = ""
            sale.save(update_fields=["exported_at", "export_last_error"])
            pushed += 1

        return Response({"pushed": pushed, "url": url})
