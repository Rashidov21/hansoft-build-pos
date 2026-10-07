from django.urls import path

from .views import (
    CashierXReportView,
    DashboardSummaryView,
    ReturnsHistoryExportXlsxView,
    ReturnsHistoryView,
)

urlpatterns = [
    path("summary/", DashboardSummaryView.as_view()),
    path("cashier-x/", CashierXReportView.as_view()),
    path("returns/", ReturnsHistoryView.as_view()),
    path("returns/export/xlsx/", ReturnsHistoryExportXlsxView.as_view()),
]

