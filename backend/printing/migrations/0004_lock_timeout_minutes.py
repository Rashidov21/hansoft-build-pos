from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("printing", "0003_storesettings_label_printer_type_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="storesettings",
            name="lock_timeout_minutes",
            field=models.PositiveSmallIntegerField(default=5),
        ),
    ]

