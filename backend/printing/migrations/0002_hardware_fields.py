from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("printing", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="storesettings",
            name="auto_print_on_sale",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="storesettings",
            name="label_printer_name",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="storesettings",
            name="receipt_printer_name",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="storesettings",
            name="receipt_width",
            field=models.CharField(default="58mm", max_length=8),
        ),
        migrations.AddField(
            model_name="storesettings",
            name="scanner_mode",
            field=models.CharField(default="keyboard", max_length=16),
        ),
        migrations.AddField(
            model_name="storesettings",
            name="scanner_prefix",
            field=models.CharField(blank=True, default="", max_length=16),
        ),
        migrations.AddField(
            model_name="storesettings",
            name="scanner_suffix",
            field=models.CharField(blank=True, default="\t", max_length=16),
        ),
    ]

