from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("sales", "0002_sale_public_sale_no"),
    ]

    operations = [
        migrations.AlterField(
            model_name="sale",
            name="public_sale_no",
            field=models.CharField(blank=True, db_index=True, default="", max_length=32, unique=True),
        ),
    ]

