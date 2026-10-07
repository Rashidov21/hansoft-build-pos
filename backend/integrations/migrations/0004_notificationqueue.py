import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("integrations", "0003_primary_report_channel"),
    ]

    operations = [
        migrations.CreateModel(
            name="NotificationQueue",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("Z_REPORT_TELEGRAM", "Z report Telegram"),
                            ("Z_REPORT_WHATSAPP", "Z report WhatsApp"),
                            ("WHATSAPP_DEBT_REMINDER", "WhatsApp debt reminder"),
                        ],
                        max_length=32,
                    ),
                ),
                ("payload", models.JSONField(default=dict)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("sent", "Sent"),
                            ("failed", "Failed"),
                        ],
                        db_index=True,
                        default="pending",
                        max_length=16,
                    ),
                ),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("last_error", models.CharField(blank=True, default="", max_length=500)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "ordering": ["created_at"],
                "indexes": [
                    models.Index(fields=["status", "created_at"], name="integ_notifq_st_cr_idx"),
                ],
            },
        ),
    ]
