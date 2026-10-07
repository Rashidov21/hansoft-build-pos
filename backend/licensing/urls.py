from django.urls import path

from .views import LicenseActivateView, LicenseStatusView

urlpatterns = [
    path("status/", LicenseStatusView.as_view()),
    path("activate/", LicenseActivateView.as_view()),
]
