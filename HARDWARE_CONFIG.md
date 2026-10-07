🔌 Geeks POS: Hardware & Integration Specifications
1. POS Terminal (Hardware Profile)
Device: POS Monoblok A156

Processor: Intel Core i5-4th Generation

Memory: 8GB RAM / 128GB SSD

OS: Windows 10/11

Performance Note: Tizim resurslardan oqilona foydalanishi (RAM optimization) va tezkor yuklanishi (startup speed) shart.

2. Peripheral Devices (Periferiya)
Receipt Printer (80mm): Xprinter XP-80C (ESC/POS protocol).

Usage: Savdo cheklarini chiqarish.

Label Printer: Xprinter XP-365B (TSPL/ESC/POS protocol).

Usage: Tovar shtrix-kodlarini (stickers) chiqarish.

Barcode Scanner: Netum NT-2050 (USB HID Mode).

Usage: Plug-and-play skaner. Interfeysda input focus har doim skanerga tayyor turishi kerak.

3. Messaging Integrations (Sozlamalar orqali tanlanadi)
Foydalanuvchi "Settings" bo'limida quyidagi ikki integratsiyadan birini yoki ikkalasini yoqishi mumkin:

A. Telegram Bot API
Logic: python-telegram-bot kutubxonasi yordamida.

Features: * Kunlik savdo yakuni (Z-report).

Omborda tovar qolmaganda ogohlantirish.

Nasiya muddati o'tgan mijozlar ro'yxati.

B. WhatsApp Business API (yoki Alternative)
Logic: Twilio yoki Chat-API/Green-API integratsiyasi orqali.

Features: * Mijozga xarid uchun "Rahmat" xabari va elektron chek yuborish.

Qarz haqida eslatma yuborish