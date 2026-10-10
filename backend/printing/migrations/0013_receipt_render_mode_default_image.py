from django.db import migrations, models


def forwards_set_image(apps, schema_editor):
    StoreSettings = apps.get_model("printing", "StoreSettings")
    StoreSettings.objects.exclude(receipt_render_mode="image").update(receipt_render_mode="image")


class Migration(migrations.Migration):
    dependencies = [
        ("printing", "0012_receipt_render_mode"),
    ]

    operations = [
        migrations.AlterField(
            model_name="storesettings",
            name="receipt_render_mode",
            field=models.CharField(
                choices=[("text", "RAW text (ESC/POS codepage)"), ("image", "Bitmap image (Cyrillic-safe)")],
                default="image",
                help_text="How receipt body is sent: RAW text or bitmap image",
                max_length=8,
            ),
        ),
        migrations.RunPython(forwards_set_image, migrations.RunPython.noop),
    ]
