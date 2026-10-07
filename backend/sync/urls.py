from django.urls import path

from .views import SyncPushView

urlpatterns = [
    path("push-sales/", SyncPushView.as_view()),
]
