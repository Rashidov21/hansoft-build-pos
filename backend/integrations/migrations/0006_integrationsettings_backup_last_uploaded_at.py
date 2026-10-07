from django.db import migrations, models


def _add_backup_last_uploaded_at_if_missing(apps, schema_editor):
    table = "integrations_integrationsettings"
    conn = schema_editor.connection
    with conn.cursor() as cursor:
        columns = {
            (row.name if hasattr(row, "name") else row[0])
            for row in conn.introspection.get_table_description(cursor, table)
        }
    if "backup_last_uploaded_at" in columns:
        return
    # SQLite in some environments doesn't support ADD COLUMN IF NOT EXISTS reliably.
    schema_editor.execute(
        f'ALTER TABLE "{table}" ADD COLUMN "backup_last_uploaded_at" datetime NULL'
    )


class Migration(migrations.Migration):
    dependencies = [
        ("integrations", "0005_integrationsettings_last_auto_z_report_date"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunPython(_add_backup_last_uploaded_at_if_missing, migrations.RunPython.noop)],
            state_operations=[
                migrations.AddField(
                    model_name="integrationsettings",
                    name="backup_last_uploaded_at",
                    field=models.DateTimeField(blank=True, null=True),
                )
            ],
        )
    ]
