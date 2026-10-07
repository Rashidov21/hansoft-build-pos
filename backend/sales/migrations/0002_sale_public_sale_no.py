from django.db import migrations, models


def seed_public_sale_no(apps, schema_editor):
    Sale = apps.get_model("sales", "Sale")
    for idx, sale in enumerate(Sale.objects.order_by("completed_at", "id"), start=1):
        sale.public_sale_no = f"S-{idx:06d}"
        sale.save(update_fields=["public_sale_no"])


class Migration(migrations.Migration):
    dependencies = [
        ("sales", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="sale",
            name="public_sale_no",
            field=models.CharField(blank=True, db_index=True, default="", max_length=32),
        ),
        migrations.RunPython(seed_public_sale_no, migrations.RunPython.noop),
    ]

