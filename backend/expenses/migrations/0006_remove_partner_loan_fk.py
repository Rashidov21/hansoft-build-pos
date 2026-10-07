from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0015_honey_decimal_qty_unit"),
        ("expenses", "0005_shopexpense_partner_pay"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="shopexpense",
            name="partner_loan",
        ),
    ]
