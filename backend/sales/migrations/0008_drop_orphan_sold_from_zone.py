# Drop orphan sold_from_zone_id (local schema drift; not in Sale model).

from django.db import migrations


def drop_orphan_zone(apps, schema_editor):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        if connection.vendor == "sqlite":
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sales_sale'"
            )
            for (idx_name,) in cursor.fetchall():
                low = (idx_name or "").lower()
                if "sold_fr" in low or "zone" in low:
                    cursor.execute(f'DROP INDEX IF EXISTS "{idx_name}"')
            cursor.execute('DROP INDEX IF EXISTS "sales_sale_sold_fr_678ccc_idx"')

            cursor.execute("PRAGMA table_info(sales_sale)")
            cols = {row[1] for row in cursor.fetchall()}
            if "sold_from_zone_id" in cols:
                cursor.execute("ALTER TABLE sales_sale DROP COLUMN sold_from_zone_id")
        else:
            try:
                cursor.execute("ALTER TABLE sales_sale DROP COLUMN IF EXISTS sold_from_zone_id")
            except Exception:
                pass


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0007_sale_archived"),
    ]

    operations = [
        migrations.RunPython(drop_orphan_zone, migrations.RunPython.noop),
    ]
