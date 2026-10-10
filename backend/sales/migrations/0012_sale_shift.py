# Generated manually for J6: bind sales to open shift

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("expenses", "0007_remove_partner_pay_category"),
        ("sales", "0011_remove_saleline_partner_loan"),
    ]

    operations = [
        migrations.AddField(
            model_name="sale",
            name="shift",
            field=models.ForeignKey(
                blank=True,
                help_text="Open shift at sale time (null for legacy rows).",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="sales",
                to="expenses.shift",
            ),
        ),
        migrations.AddIndex(
            model_name="sale",
            index=models.Index(fields=["shift", "-completed_at"], name="sales_sale_shift_i_idx"),
        ),
    ]
