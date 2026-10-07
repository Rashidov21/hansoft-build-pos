from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0002_shift_shopexpense_related_shift_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='shift',
            name='report_sent',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='shift',
            name='report_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
