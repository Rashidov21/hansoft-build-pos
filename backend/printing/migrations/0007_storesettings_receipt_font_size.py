from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("printing", "0006_storesettings_inventory_config"),
    ]

    operations = [
        migrations.AddField(
            model_name="storesettings",
            name="receipt_font_size",
            field=models.PositiveSmallIntegerField(default=0),
        ),
    ]

