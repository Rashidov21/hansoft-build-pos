from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="IntegrationSettings",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("telegram_bot_token", models.CharField(max_length=255, blank=True, default="")),
                ("telegram_chat_id", models.CharField(max_length=128, blank=True, default="")),
                ("whatsapp_api_base", models.CharField(max_length=255, blank=True, default="")),
                ("whatsapp_api_token", models.CharField(max_length=255, blank=True, default="")),
                ("whatsapp_sender", models.CharField(max_length=64, blank=True, default="")),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
    ]

