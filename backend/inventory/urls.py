from django.urls import path

from .views import (
    AdjustView,
    ReceiveView,
    StocktakeApplyView,
    StocktakeCountView,
    StocktakeSessionListView,
    StocktakeSessionCreateView,
    StocktakeSessionDetailView,
    StockEventsView,
)

urlpatterns = [
    path("receive/", ReceiveView.as_view()),
    path("adjust/", AdjustView.as_view()),
    path("stocktake/sessions/list/", StocktakeSessionListView.as_view()),
    path("stocktake/sessions/", StocktakeSessionCreateView.as_view()),
    path("stocktake/sessions/<uuid:session_id>/", StocktakeSessionDetailView.as_view()),
    path("stocktake/sessions/<uuid:session_id>/count/", StocktakeCountView.as_view()),
    path("stocktake/sessions/<uuid:session_id>/apply/", StocktakeApplyView.as_view()),
    path("stock-events/", StockEventsView.as_view()),
]
