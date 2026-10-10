from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("printing", "0011_label_gap_direction"),
    ]

    operations = [
        migrations.AddField(
            model_name="storesettings",
            name="receipt_render_mode",
            field=models.CharField(
                choices=[
                    ("text", "RAW text (ESC/POS codepage)"),
                    ("image", "Bitmap image (Cyrillic-safe)"),
                ],
                default="text",
                help_text="How receipt body is sent: RAW text or bitmap image",
                max_length=8,
            ),
        ),
    ]
