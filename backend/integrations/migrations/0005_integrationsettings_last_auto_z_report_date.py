from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("integrations", "0004_notificationqueue"),
    ]

    operations = [
        migrations.AddField(
            model_name="integrationsettings",
            name="last_auto_z_report_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
