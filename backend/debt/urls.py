from django.urls import path

from .views import (
    CustomerCreateView,
    CustomerSearchView,
    CustomerUpdateView,
    DebtListView,
    DebtPaymentView,
    OpenDebtsView,
)

urlpatterns = [
    path("customers/search/", CustomerSearchView.as_view()),
    path("customers/", CustomerCreateView.as_view()),
    path("customers/<uuid:pk>/", CustomerUpdateView.as_view()),
    path("debts/open/", OpenDebtsView.as_view()),
    path("debts/", DebtListView.as_view()),
    path("payments/", DebtPaymentView.as_view()),
]
