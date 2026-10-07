import uuid

from django.db import models


class IntegrationSettings(models.Model):
    class WhatsAppProvider(models.TextChoices):
        GREEN_API = "GREEN_API", "GreenAPI"
        CUSTOM = "CUSTOM", "Custom API"
    class PrimaryReportChannel(models.TextChoices):
        TELEGRAM = "telegram", "Telegram"
        WHATSAPP = "whatsapp", "WhatsApp"
        BOTH = "both", "Both"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    telegram_bot_token = models.CharField(max_length=255, blank=True, default="")
    telegram_chat_id = models.CharField(max_length=128, blank=True, default="")
    whatsapp_api_base = models.CharField(max_length=255, blank=True, default="")
    whatsapp_api_token = models.CharField(max_length=255, blank=True, default="")
    whatsapp_sender = models.CharField(max_length=64, blank=True, default="")
    whatsapp_provider = models.CharField(
        max_length=16, choices=WhatsAppProvider.choices, default=WhatsAppProvider.GREEN_API
    )
    greenapi_instance_id = models.CharField(max_length=64, blank=True, default="")
    greenapi_api_token_instance = models.CharField(max_length=255, blank=True, default="")
    primary_report_channel = models.CharField(
        max_length=16, choices=PrimaryReportChannel.choices, default=PrimaryReportChannel.BOTH
    )
    # uz | ru | uz-cyrl | "" (empty → StoreSettings.receipt_lang → uz)
    report_lang = models.CharField(max_length=16, blank=True, default="")
    auto_daily_z_report_enabled = models.BooleanField(default=True)
    last_auto_z_report_date = models.DateField(null=True, blank=True)
    auto_debt_whatsapp_reminder_enabled = models.BooleanField(default=True)
    last_auto_debt_reminder_date = models.DateField(null=True, blank=True)
    # 0 = off, 1 = daily, 3 = every 3 days — SQLite file to Telegram owner chat.
    telegram_db_backup_interval_days = models.PositiveSmallIntegerField(default=3)
    last_telegram_db_backup_at = models.DateTimeField(null=True, blank=True)
    # Internal scheduler state for remote backup throttle (not user-configurable from Settings UI).
    backup_last_uploaded_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get_solo(cls):
        obj = cls.objects.order_by("-updated_at").first()
        if obj:
            return obj
        return cls.objects.create()


class NotificationQueue(models.Model):
    """Offline-first outbound notifications (Telegram/WhatsApp)."""

    class Kind(models.TextChoices):
        Z_REPORT_TELEGRAM = "Z_REPORT_TELEGRAM", "Z report Telegram"
        Z_REPORT_WHATSAPP = "Z_REPORT_WHATSAPP", "Z report WhatsApp"
        WHATSAPP_DEBT_REMINDER = "WHATSAPP_DEBT_REMINDER", "WhatsApp debt reminder"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=32, choices=Kind.choices)
    payload = models.JSONField(default=dict)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"], name="integ_notifq_st_cr_idx"),
        ]

