from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("integrations", "0007_auto_debt_whatsapp_reminder"),
    ]

    operations = [
        migrations.AddField(
            model_name="integrationsettings",
            name="report_lang",
            field=models.CharField(blank=True, default="", max_length=16),
        ),
        migrations.AddField(
            model_name="integrationsettings",
            name="auto_daily_z_report_enabled",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="integrationsettings",
            name="telegram_db_backup_interval_days",
            field=models.PositiveSmallIntegerField(default=3),
        ),
        migrations.AddField(
            model_name="integrationsettings",
            name="last_telegram_db_backup_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
