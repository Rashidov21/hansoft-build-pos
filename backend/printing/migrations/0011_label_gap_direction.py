from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("printing", "0010_label_defaults"),
    ]

    operations = [
        migrations.AddField(
            model_name="storesettings",
            name="label_gap_mm",
            field=models.DecimalField(
                decimal_places=1,
                default=Decimal("2.0"),
                help_text="TSPL GAP height in mm between labels on the roll",
                max_digits=4,
            ),
        ),
        migrations.AddField(
            model_name="storesettings",
            name="label_direction",
            field=models.PositiveSmallIntegerField(
                default=1,
                help_text="TSPL DIRECTION command (0 or 1)",
            ),
        ),
    ]
