from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("licensing", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="licensestate",
            name="demo_started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
