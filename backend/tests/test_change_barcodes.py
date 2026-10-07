import os
import django

# Django muhitini sozlash
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings') # 'core' o'rniga loyihangiz nomini yozing
django.setup()

from catalog.models import ProductVariant # Modellar yo'li loyihangizga qarab o'zgarishi mumkin
from django.db import transaction

def migrate_to_simple_barcodes():
    print("--- Shtrix-kodlarni optimallashtirish boshlandi ---")
    
    # 20 dan boshlanuvchi 8 xonali son (masalan: 20000001)
    prefix = 20
    counter = 1
    
    variants = ProductVariant.objects.all().order_by('id')
    total = variants.count()
    
    if total == 0:
        print("Migratsiya uchun tovarlar topilmadi.")
        return

    try:
        with transaction.atomic():
            for variant in variants:
                # Yangi kodni generatsiya qilish: 20 + 00000 + 1 = 20000001
                new_barcode = f"{prefix}{str(counter).zfill(6)}"
                
                old_barcode = variant.barcode
                variant.barcode = new_barcode
                variant.save()
                
                print(f"ID: {variant.id} | [{old_barcode}]  ==>  [{new_barcode}]")
                counter += 1
                
        print(f"\n--- Muvaffaqiyatli! {total} ta mahsulot yangilandi ---")
        print("Endi skaneringiz ushbu kodlarni juda oson taniydi.")

    except Exception as e:
        print(f"Xatolik yuz berdi: {e}")

if __name__ == "__main__":
    migrate_to_simple_barcodes()