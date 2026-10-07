from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("integrations", "0002_greenapi_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="integrationsettings",
            name="primary_report_channel",
            field=models.CharField(
                choices=[("telegram", "Telegram"), ("whatsapp", "WhatsApp"), ("both", "Both")],
                default="both",
                max_length=16,
            ),
        ),
    ]

