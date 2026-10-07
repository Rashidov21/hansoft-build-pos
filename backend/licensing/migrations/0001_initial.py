import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="LicenseState",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("hardware_id", models.CharField(blank=True, default="", max_length=128)),
                ("license_key", models.CharField(blank=True, default="", max_length=255)),
                ("expiry_ciphertext", models.BinaryField(blank=True, null=True)),
                ("last_check_at", models.DateTimeField(blank=True, null=True)),
                ("last_check_ok", models.BooleanField(default=False)),
                ("last_check_message", models.CharField(blank=True, default="", max_length=500)),
                ("last_valid_remote_at", models.DateTimeField(blank=True, null=True)),
                ("raw_status_json", models.TextField(blank=True, default="")),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "License state",
            },
        ),
    ]
