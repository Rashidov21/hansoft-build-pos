from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0015_honey_decimal_qty_unit"),
        ("sales", "0010_honey_decimal_qty_unit"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="saleline",
            name="partner_loan",
        ),
    ]
