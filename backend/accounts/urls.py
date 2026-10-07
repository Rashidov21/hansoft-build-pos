from django.urls import path

from .views import (
    CsrfView,
    LoginView,
    LogoutView,
    MeView,
    PinLoginView,
    PinUsersView,
    SetUserPinView,
    UserListView,
    UserCreateView,
    UserDetailView,
    ShiftStatusView,
    OpenShiftView,
    CloseShiftView,
    MarkShiftReportSentView,
)

urlpatterns = [
    path("csrf/", CsrfView.as_view()),
    path("login/", LoginView.as_view()),
    path("pin-users/", PinUsersView.as_view()),
    path("pin-login/", PinLoginView.as_view()),
    path("set-pin/", SetUserPinView.as_view()),
    path("logout/", LogoutView.as_view()),
    path("me/", MeView.as_view()),
    path("shift/status/", ShiftStatusView.as_view()),
    path("shift/open/", OpenShiftView.as_view()),
    path("shift/close/", CloseShiftView.as_view()),
    path("shift/mark-report-sent/", MarkShiftReportSentView.as_view()),
    path("users/", UserListView.as_view()),
    path("users/create/", UserCreateView.as_view()),
    path("users/<int:user_id>/", UserDetailView.as_view()),
]
