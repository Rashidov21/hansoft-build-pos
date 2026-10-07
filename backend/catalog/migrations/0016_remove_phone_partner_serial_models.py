from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0011_remove_saleline_partner_loan"),
        ("expenses", "0006_remove_partner_loan_fk"),
        ("catalog", "0015_honey_decimal_qty_unit"),
    ]

    operations = [
        migrations.DeleteModel(
            name="SerialNumber",
        ),
        migrations.DeleteModel(
            name="PartnerLoan",
        ),
        migrations.DeleteModel(
            name="PartnerStore",
        ),
        migrations.RemoveField(
            model_name="productvariant",
            name="color",
        ),
        migrations.RemoveField(
            model_name="productvariant",
            name="storage_gb",
        ),
    ]
