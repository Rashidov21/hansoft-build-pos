from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("integrations", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="integrationsettings",
            name="greenapi_api_token_instance",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="integrationsettings",
            name="greenapi_instance_id",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="integrationsettings",
            name="whatsapp_provider",
            field=models.CharField(
                choices=[("GREEN_API", "GreenAPI"), ("CUSTOM", "Custom API")],
                default="GREEN_API",
                max_length=16,
            ),
        ),
    ]

