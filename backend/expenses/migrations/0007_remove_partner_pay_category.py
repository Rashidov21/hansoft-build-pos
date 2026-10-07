from django.db import migrations, models


def remap_partner_pay(apps, schema_editor):
    ShopExpense = apps.get_model("expenses", "ShopExpense")
    ShopExpense.objects.filter(category="PARTNER_PAY").update(category="OTHER")


class Migration(migrations.Migration):

    dependencies = [
        ("expenses", "0006_remove_partner_loan_fk"),
    ]

    operations = [
        migrations.RunPython(remap_partner_pay, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="shopexpense",
            name="category",
            field=models.CharField(
                choices=[
                    ("RENT", "Rent"),
                    ("UTILITIES", "Utilities"),
                    ("SUPPLIES", "Supplies"),
                    ("SALARY", "Salary"),
                    ("OTHER", "Other"),
                ],
                default="OTHER",
                max_length=32,
            ),
        ),
    ]
