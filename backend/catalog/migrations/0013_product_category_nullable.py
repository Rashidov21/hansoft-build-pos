# Ensure product.product_category_id is nullable (matches model / migration 0008).

from django.db import migrations


def ensure_product_category_nullable(apps, schema_editor):
    connection = schema_editor.connection
    if connection.vendor != "sqlite":
        with connection.cursor() as cursor:
            cursor.execute(
                "ALTER TABLE catalog_product ALTER COLUMN product_category_id DROP NOT NULL"
            )
        return

    with connection.cursor() as cursor:
        cursor.execute("PRAGMA table_info(catalog_product)")
        cols = {row[1]: row for row in cursor.fetchall()}
        pc = cols.get("product_category_id")
        if pc is None or pc[3] == 0:
            return

        cursor.execute("PRAGMA foreign_keys=OFF")
        cursor.execute(
            """
            CREATE TABLE catalog_product_new (
                id char(32) NOT NULL PRIMARY KEY,
                name_uz varchar(255) NOT NULL,
                name_ru varchar(255) NOT NULL,
                name_uz_cyrillic varchar(255) NULL,
                custom_name_uz varchar(255) NULL,
                custom_name_ru varchar(255) NULL,
                custom_name_uz_cyrillic varchar(255) NULL,
                is_active bool NOT NULL,
                deleted_at datetime NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                category_id char(32) NOT NULL REFERENCES catalog_category (id) DEFERRABLE INITIALLY DEFERRED,
                product_category_id char(32) NULL REFERENCES catalog_productcategory (id) DEFERRABLE INITIALLY DEFERRED
            )
            """
        )
        cursor.execute(
            """
            INSERT INTO catalog_product_new (
                id, name_uz, name_ru, name_uz_cyrillic,
                custom_name_uz, custom_name_ru, custom_name_uz_cyrillic,
                is_active, deleted_at, created_at, updated_at,
                category_id, product_category_id
            )
            SELECT
                id, name_uz, name_ru, name_uz_cyrillic,
                custom_name_uz, custom_name_ru, custom_name_uz_cyrillic,
                is_active, deleted_at, created_at, updated_at,
                category_id, product_category_id
            FROM catalog_product
            """
        )
        cursor.execute("DROP TABLE catalog_product")
        cursor.execute("ALTER TABLE catalog_product_new RENAME TO catalog_product")
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS catalog_pro_categor_6f33f5_idx ON catalog_product (category_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS catalog_pro_product_8c1a2b_idx ON catalog_product (product_category_id)"
        )
        cursor.execute("PRAGMA foreign_keys=ON")


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0012_drop_orphan_uom_id"),
    ]

    operations = [
        migrations.RunPython(ensure_product_category_nullable, migrations.RunPython.noop),
    ]
