from django.urls import path

from .views import (
    AllShiftsSummaryView,
    ShiftExpenseSummaryView,
    ShopExpenseDetailView,
    ShopExpenseExportPdfView,
    ShopExpenseExportXlsxView,
    ShopExpenseListCreateView,
)

urlpatterns = [
    path("", ShopExpenseListCreateView.as_view()),
    path("export/xlsx/", ShopExpenseExportXlsxView.as_view()),
    path("export/pdf/", ShopExpenseExportPdfView.as_view()),
    path("<uuid:pk>/", ShopExpenseDetailView.as_view()),
    path("shifts/summary/", AllShiftsSummaryView.as_view()),
    path("shifts/<uuid:shift_id>/summary/", ShiftExpenseSummaryView.as_view()),
]
