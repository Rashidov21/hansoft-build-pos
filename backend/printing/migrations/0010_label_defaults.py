from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("printing", "0009_honey_decimal_qty_unit"),
    ]

    operations = [
        migrations.AddField(
            model_name="storesettings",
            name="label_printing_enabled",
            field=models.BooleanField(
                default=True,
                help_text="Enable label/sticker printing UI (disable if store has no label printer)",
            ),
        ),
        migrations.AddField(
            model_name="storesettings",
            name="default_label_size",
            field=models.CharField(
                choices=[
                    ("30x20", "30×20 mm"),
                    ("40x30", "40×30 mm"),
                    ("40x50", "40×50 mm"),
                    ("50x40", "50×40 mm"),
                    ("58mm", "58×40 mm"),
                ],
                default="40x30",
                max_length=8,
            ),
        ),
    ]
