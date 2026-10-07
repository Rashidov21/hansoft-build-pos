from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("integrations", "0006_integrationsettings_backup_last_uploaded_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="integrationsettings",
            name="auto_debt_whatsapp_reminder_enabled",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="integrationsettings",
            name="last_auto_debt_reminder_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
