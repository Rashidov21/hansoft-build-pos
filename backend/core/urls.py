from django.http import JsonResponse
from django.urls import path

from .views import BackupNowView, ConnectivityView


def health(_request):
    # Build POS: alohida service id — boshqa Hansoft (geeks-pos-api) bilan port chalkashmasin.
    return JsonResponse({"status": "ok", "service": "hansoft-build-pos-api"})


urlpatterns = [
    path("health/", health, name="health"),
    path("connectivity/", ConnectivityView.as_view(), name="connectivity"),
    path("backup-now/", BackupNowView.as_view(), name="backup-now"),
]
