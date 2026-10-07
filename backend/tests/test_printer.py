# import win32print

# Windowsdagi printeringiz nomini yozing
# printer_name = "Xprinter XP-365B" 

# raw_data = b"Salom! Bu test cheki.\nYaxhis kunlarda korishaylik\n\nNima gaplar\n\n"
# hPrinter = win32print.OpenPrinter(printer_name)
# try:
#     hJob = win32print.StartDocPrinter(hPrinter, 1, ("Test", None, "RAW"))
#     win32print.StartPagePrinter(hPrinter)
#     win32print.WritePrinter(hPrinter, raw_data)
#     win32print.EndPagePrinter(hPrinter)
#     win32print.EndDocPrinter(hPrinter)
# finally:
#     win32print.ClosePrinter(hPrinter)

# import win32print

# printer_name = "Xprinter XP-365B" # Windowsdagi aniq nomi

# # TSPL buyruqlari (Stiker o'lchamiga qarab o'zgaradi)
# tspl_data = b"SIZE 40 mm, 30 mm\r\n" # Stiker o'lchami
# tspl_data += b"GAP 3 mm, 0 mm\r\n"    # Stikerlar orasidagi masofa
# tspl_data += b"CLS\r\n"                # Xotirani tozalash
# tspl_data += b"TEXT 50,50,\"3\",0,1,1,\"TEST STIKER\"\r\n" # Matn kordinatasi
# tspl_data += b"BARCODE 50,100,\"128\",50,1,0,2,2,\"12345678\"\r\n" # Shtrix-kod
# tspl_data += b"PRINT 1,1\r\n"          # 1 ta nusxa chop etish

# hPrinter = win32print.OpenPrinter(printer_name)
# try:
#     hJob = win32print.StartDocPrinter(hPrinter, 1, ("LabelTest", None, "RAW"))
#     win32print.StartPagePrinter(hPrinter)
#     win32print.WritePrinter(hPrinter, tspl_data)
#     win32print.EndPagePrinter(hPrinter)
#     win32print.EndDocPrinter(hPrinter)
# finally:
#     win32print.ClosePrinter(hPrinter)

# import win32print

# # 1. SOZLAMALAR
# PRINTER_NAME = "Xprinter XP-365B" # Windows-dagi aniq nomi
# BARCODE_TO_TEST = "PRD-8BBCA40F"
# PRODUCT_NAME = "Krossfit"
# PRODUCT_DETAILS = "42 / Kulrang"
# PRICE = "3 000"

# # 2. QIDIRUV LOGIKASI (SIMULATSIYA)
# def test_barcode_search(scanned_code):
#     print(f"--- Skanerlash testi boshlandi ---")
#     print(f"Skanerlandi: [{scanned_code}]")
    
#     # Dasturdagi qidiruv mantiqi shunday bo'lishi kerak:
#     if scanned_code.strip() == BARCODE_TO_TEST:
#         print(f"Natija: Tovar topildi!")
#         print(f"Nomi: {PRODUCT_NAME} | Detal: {PRODUCT_DETAILS} | Narxi: {PRICE}")
#         return True
#     else:
#         print("Natija: Tovar topilmadi! (Xatolik)")
#         return False

# # 3. CHOP ETISH LOGIKASI (TSPL)
# def test_label_print():
#     print(f"\n--- Printer testi boshlandi ({PRINTER_NAME}) ---")
    
#     # TSPL Buyruqlari (XP-365B uchun)
#     tspl_data = b"SIZE 40 mm, 30 mm\r\n"   # Stiker o'lchami
#     tspl_data += b"GAP 3 mm, 0 mm\r\n"      # Oraliq masofa
#     tspl_data += b"DIRECTION 1\r\n"         # Bosish yo'nalishi
#     tspl_data += b"CLS\r\n"                  # Xotirani tozalash
    
#     # Matn va Barcode joylashuvi (Kordinatalar: X, Y)
#     tspl_data += f"TEXT 20,20,\"3\",0,1,1,\"{PRODUCT_NAME}\"\r\n".encode('gbk')
#     tspl_data += f"TEXT 20,60,\"2\",0,1,1,\"{PRODUCT_DETAILS}\"\r\n".encode('gbk')
#     tspl_data += f"BARCODE 20,100,\"128\",60,1,0,2,2,\"{BARCODE_TO_TEST}\"\r\n".encode('ascii')
#     tspl_data += f"TEXT 20,180,\"3\",0,1,1,\"NARXI: {PRICE}\"\r\n".encode('gbk')
    
#     tspl_data += b"PRINT 1,1\r\n"            # 1 nusxa chiqarish

#     try:
#         hPrinter = win32print.OpenPrinter(PRINTER_NAME)
#         try:
#             hJob = win32print.StartDocPrinter(hPrinter, 1, ("LabelTest", None, "RAW"))
#             win32print.StartPagePrinter(hPrinter)
#             win32print.WritePrinter(hPrinter, tspl_data)
#             win32print.EndPagePrinter(hPrinter)
#             win32print.EndDocPrinter(hPrinter)
#             print("Muvaffaqiyatli: Buyruq printerga yuborildi.")
#         finally:
#             win32print.ClosePrinter(hPrinter)
#     except Exception as e:
#         print(f"Xatolik yuz berdi: {e}")

# # TESTLARNI ISHGA TUSHIRISH
# if __name__ == "__main__":
#     if test_barcode_search(BARCODE_TO_TEST):
#         test_label_print()

try:
    import win32print
except ImportError:
    win32print = None
import pytest

PRINTER_NAME = "Xprinter XP-365B"
SIMPLE_CODE = "20000001" # Faqat raqamli oddiy kod

def test_simple_barcode():
    if not win32print:
        pytest.skip("win32print is not installed")
    tspl_data = b"SIZE 40 mm, 30 mm\r\n"
    tspl_data += b"GAP 3 mm, 0 mm\r\n"
    tspl_data += b"CLS\r\n"
    
    # TEXT: Mahsulot nomi
    tspl_data += b"TEXT 40,30,\"3\",0,1,1,\"TEST TOVAR\"\r\n"
    
    # BARCODE: "3,3" qalinligi bilan (Skaner yaxshi o'qishi uchun)
    # Parametrlar: X, Y, Type, Height, Human-readable, Rotation, Narrow, Wide, Content
    tspl_data += f"BARCODE 40,80,\"128\",80,1,0,3,3,\"{SIMPLE_CODE}\"\r\n".encode('ascii')
    
    tspl_data += b"PRINT 1,1\r\n"

    try:
        hPrinter = win32print.OpenPrinter(PRINTER_NAME)
        hJob = win32print.StartDocPrinter(hPrinter, 1, ("SimpleTest", None, "RAW"))
        win32print.StartPagePrinter(hPrinter)
        win32print.WritePrinter(hPrinter, tspl_data)
        win32print.EndPagePrinter(hPrinter)
        win32print.EndDocPrinter(hPrinter)
        win32print.ClosePrinter(hPrinter)
        print(f"Muvaffaqiyatli! {SIMPLE_CODE} kodi chop etildi.")
    except Exception as e:
        print(f"Xato: {e}")

if __name__ == "__main__":
    test_simple_barcode()