from django.http import JsonResponse
from django.urls import path

from .views import BackupNowView, ConnectivityView


def health(_request):
    return JsonResponse({"status": "ok", "service": "geeks-pos-api"})


urlpatterns = [
    path("health/", health, name="health"),
    path("connectivity/", ConnectivityView.as_view(), name="connectivity"),
    path("backup-now/", BackupNowView.as_view(), name="backup-now"),
]
