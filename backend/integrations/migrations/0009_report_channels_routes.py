import uuid

from django.db import migrations, models


def seed_channels_and_routes(apps, schema_editor):
    IntegrationSettings = apps.get_model("integrations", "IntegrationSettings")
    ReportChannel = apps.get_model("integrations", "ReportChannel")
    ReportRoute = apps.get_model("integrations", "ReportRoute")

    settings = IntegrationSettings.objects.order_by("-updated_at").first()
    tg_chat = (getattr(settings, "telegram_chat_id", None) or "").strip() if settings else ""
    wa_sender = (getattr(settings, "whatsapp_sender", None) or "").strip() if settings else ""
    primary = (
        (getattr(settings, "primary_report_channel", None) or "both").strip().lower()
        if settings
        else "both"
    )

    owner_tg = None
    owner_wa = None
    if tg_chat:
        owner_tg = ReportChannel.objects.create(
            id=uuid.uuid4(),
            name="Egasi (Telegram)",
            kind="telegram",
            address=tg_chat,
            is_active=True,
            sort_order=0,
        )
    if wa_sender:
        owner_wa = ReportChannel.objects.create(
            id=uuid.uuid4(),
            name="Egasi (WhatsApp)",
            kind="whatsapp",
            address=wa_sender,
            is_active=True,
            sort_order=1,
        )

    z_channels = []
    if primary in ("telegram", "both") and owner_tg:
        z_channels.append(owner_tg)
    if primary in ("whatsapp", "both") and owner_wa:
        z_channels.append(owner_wa)
    if not z_channels:
        z_channels = [c for c in (owner_tg, owner_wa) if c]

    route_z = ReportRoute.objects.create(
        id=uuid.uuid4(), report_type="daily_z", enabled=True
    )
    if z_channels:
        route_z.channels.set(z_channels)

    route_low = ReportRoute.objects.create(
        id=uuid.uuid4(), report_type="low_stock", enabled=True
    )
    # Default: same as Z until admin assigns a staff chat.
    if z_channels:
        route_low.channels.set(z_channels)

    route_backup = ReportRoute.objects.create(
        id=uuid.uuid4(), report_type="db_backup", enabled=True
    )
    if owner_tg:
        route_backup.channels.set([owner_tg])


def noop_reverse(apps, schema_editor):
    ReportRoute = apps.get_model("integrations", "ReportRoute")
    ReportChannel = apps.get_model("integrations", "ReportChannel")
    ReportRoute.objects.all().delete()
    ReportChannel.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("integrations", "0008_report_lang_telegram_db_backup"),
    ]

    operations = [
        migrations.CreateModel(
            name="ReportChannel",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
                (
                    "kind",
                    models.CharField(
                        choices=[("telegram", "Telegram"), ("whatsapp", "WhatsApp")],
                        max_length=16,
                    ),
                ),
                (
                    "address",
                    models.CharField(
                        help_text="Telegram chat_id or WhatsApp phone / chatId",
                        max_length=128,
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["sort_order", "name"]},
        ),
        migrations.CreateModel(
            name="ReportRoute",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "report_type",
                    models.CharField(
                        choices=[
                            ("daily_z", "Daily Z / owner summary"),
                            ("low_stock", "Low stock alert"),
                            ("db_backup", "DB backup (Telegram)"),
                        ],
                        max_length=32,
                        unique=True,
                    ),
                ),
                ("enabled", models.BooleanField(default=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "channels",
                    models.ManyToManyField(
                        blank=True,
                        related_name="routes",
                        to="integrations.reportchannel",
                    ),
                ),
            ],
            options={"ordering": ["report_type"]},
        ),
        migrations.AddField(
            model_name="integrationsettings",
            name="auto_low_stock_report_enabled",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="integrationsettings",
            name="last_auto_low_stock_report_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="notificationqueue",
            name="kind",
            field=models.CharField(
                choices=[
                    ("Z_REPORT_TELEGRAM", "Z report Telegram"),
                    ("Z_REPORT_WHATSAPP", "Z report WhatsApp"),
                    ("LOW_STOCK_TELEGRAM", "Low stock Telegram"),
                    ("LOW_STOCK_WHATSAPP", "Low stock WhatsApp"),
                    ("WHATSAPP_DEBT_REMINDER", "WhatsApp debt reminder"),
                ],
                max_length=32,
            ),
        ),
        migrations.RunPython(seed_channels_and_routes, noop_reverse),
    ]
