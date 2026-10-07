from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("printing", "0007_storesettings_receipt_font_size"),
    ]

    operations = [
        migrations.AddField(
            model_name="storesettings",
            name="receipt_printing_enabled",
            field=models.BooleanField(
                default=False,
                help_text="Enable receipt printing after sales (disable if store has no receipt printer)",
            ),
        ),
    ]
