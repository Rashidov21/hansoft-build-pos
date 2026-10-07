from django.urls import path

from .views import (
    BackupAutoRunView,
    DailyDebtReminderAutoRunView,
    DailyDebtReminderSendView,
    IntegrationSettingsView,
    NotificationQueueFlushView,
    TelegramZReportSendView,
    WhatsAppDebtReminderView,
    WhatsAppSendTextView,
    ZReportSendView,
)

urlpatterns = [
    path("settings/", IntegrationSettingsView.as_view()),
    path("backup/auto-run/", BackupAutoRunView.as_view()),
    path("z-report/send/", ZReportSendView.as_view()),
    path("telegram/send-z-report/", TelegramZReportSendView.as_view()),
    path("whatsapp/remind/", WhatsAppDebtReminderView.as_view()),
    path("whatsapp/debt-reminders/daily/", DailyDebtReminderSendView.as_view()),
    path("whatsapp/debt-reminders/auto-run/", DailyDebtReminderAutoRunView.as_view()),
    path("whatsapp/send-text/", WhatsAppSendTextView.as_view()),
    path("notification-queue/flush/", NotificationQueueFlushView.as_view()),
]

