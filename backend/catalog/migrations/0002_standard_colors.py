from django.db import migrations


STANDARD_COLORS = [
    ("std_black", "Qora", "Черный", 10),
    ("std_white", "Oq", "Белый", 20),
    ("std_gray", "Kulrang", "Серый", 30),
    ("std_brown", "Jigarrang", "Коричневый", 40),
    ("std_blue", "Ko'k", "Синий", 50),
    ("std_red", "Qizil", "Красный", 60),
    ("std_yellow", "Sariq", "Желтый", 70),
    ("std_green", "Yashil", "Зеленый", 80),
    ("std_beige", "Sutrang (Bej)", "Бежевый", 90),
    ("std_navy", "To'q ko'k", "Темно-синий", 100),
]


def seed_colors(apps, schema_editor):
    Color = apps.get_model("catalog", "Color")
    for value, uz, ru, sort_order in STANDARD_COLORS:
        Color.objects.get_or_create(
            value=value,
            defaults={"label_uz": uz, "label_ru": ru, "sort_order": sort_order},
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_colors, noop_reverse),
    ]
