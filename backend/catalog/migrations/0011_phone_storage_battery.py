# Generated manually for phone-store catalog fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0010_suppliertransaction_voided"),
    ]

    operations = [
        migrations.AddField(
            model_name="productvariant",
            name="storage_gb",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Storage capacity in GB (phones), e.g. 128, 256",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="serialnumber",
            name="battery_health",
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text="Battery health percent for iPhones (0-100), optional",
                null=True,
            ),
        ),
        migrations.AlterModelOptions(
            name="productspecification",
            options={
                "verbose_name": "Product Specification",
                "verbose_name_plural": "Product Specifications",
            },
        ),
    ]
