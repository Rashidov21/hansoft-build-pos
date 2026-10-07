# Fix local schema drift: orphan uom_id (+ index) and unitofmeasure table.

from django.db import migrations


def drop_orphan_uom(apps, schema_editor):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        if connection.vendor == "sqlite":
            cursor.execute("PRAGMA index_list(catalog_productvariant)")
            for row in cursor.fetchall():
                idx_name = row[1]
                if "uom" in (idx_name or "").lower():
                    cursor.execute(f'DROP INDEX IF EXISTS "{idx_name}"')

            cursor.execute("PRAGMA table_info(catalog_productvariant)")
            cols = {row[1] for row in cursor.fetchall()}
            if "uom_id" in cols:
                cursor.execute("ALTER TABLE catalog_productvariant DROP COLUMN uom_id")

            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='catalog_unitofmeasure'"
            )
            if cursor.fetchone():
                cursor.execute("DROP TABLE IF EXISTS catalog_unitofmeasure")
        else:
            cursor.execute("DROP INDEX IF EXISTS catalog_productvariant_uom_id_ba630636")
            try:
                cursor.execute("ALTER TABLE catalog_productvariant DROP COLUMN uom_id")
            except Exception:
                pass
            cursor.execute("DROP TABLE IF EXISTS catalog_unitofmeasure")


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0011_phone_storage_battery"),
    ]

    operations = [
        migrations.RunPython(drop_orphan_uom, migrations.RunPython.noop),
    ]
