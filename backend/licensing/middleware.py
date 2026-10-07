"""Block sales/inventory mutations when license enforcement is on and license invalid."""

from __future__ import annotations

from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin

from .services import enforcement_enabled, is_license_valid_for_use

_SKIP_PREFIXES = (
    "/api/health",
    "/api/auth/",
    "/api/licensing/",
    "/api/integrations/notification-queue/flush",
)


def _is_sales_inventory_mutation(path: str, method: str) -> bool:
    if method not in ("POST", "PUT", "PATCH", "DELETE"):
        return False
    if path.startswith("/api/sales/"):
        if "/complete/" in path:
            return True
        if "/void/" in path or "/return/" in path:
            return True
        return False
    if path.startswith("/api/inventory/"):
        return True
    return False


class LicenseEnforcementMiddleware(MiddlewareMixin):
    def process_request(self, request):
        if not enforcement_enabled():
            return None

        path = request.path or ""

        for prefix in _SKIP_PREFIXES:
            if path.startswith(prefix):
                return None

        if not _is_sales_inventory_mutation(path, request.method):
            return None

        if is_license_valid_for_use():
            return None

        return JsonResponse(
            {"code": "LICENSE_EXPIRED", "detail": "License is not valid or has expired."},
            status=403,
        )
