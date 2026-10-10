# Geeks POS: Hardware & Integration Specifications

## 1. POS Terminal (Hardware Profile)

| Band | Qiymat |
|------|--------|
| Device | POS Monoblok A156 |
| Processor | Intel Core i5 (4th Gen+) |
| Memory | 8GB RAM / 128GB SSD |
| OS | Windows 10/11 |

Performance: tezkor yuklash va o‘rtacha RAM sarfi shart.

## 2. Peripheral Devices

### 2.1 Receipt printer — Xprinter XP-80C

| Band | Qiymat |
|------|--------|
| Protocol | **ESC/POS** (RAW spooler) |
| Paper | **80 mm** (yoki 58 mm — Sozlamalarda) |
| Usage | Savdo cheki, nakladnoy (pick-list), test chek |
| Windows | Queue nomi Sozlamalarda; ixtiyoriy port hint (`USB001`) |
| Fallback model | `XP-80C` (`printingHub`) |

**Chek matnlari manbai (`StoreSettings`):**

| Maydon | Vazifa |
|--------|--------|
| `brand_name` | Sarlavha |
| `phone`, `address` | Header |
| `footer_note` | Pastki matn |
| `receipt_lang` | `uz` / `ru` / `ky` / bo‘sh=UI tili |
| `transliterate_uz`, `encoding` | Lotin/codepage |
| `receipt_width` | `58mm` \| `80mm` |
| `receipt_font_size` | `0`=avto (58→22, 80→26); aks holda 14–40 |
| `receipt_render_mode` | `text` (RAW/codepage) yoki `image` (bitmap — kirill uchun tavsiya) |
| `receipt_printing_enabled` | Master switch (POS chek UI) |
| `auto_print_on_sale` | Sotuvdan keyin avto-chek |

UI: **Sozlamalar → Hardware wizard step 1** + Do‘kon tab (brand/footer/til).

### 2.2 Label printer — Xprinter XP-365B

| Band | Qiymat |
|------|--------|
| Protocol | **TSPL** (asosiy); ESC/POS label fallback |
| Usage | Tovar shtrix-kod stikerlari |
| Windows | Queue nomi; port hint (`USB002`) |
| Fallback model | `XP-365B` (`printingHub`) |

**Stiker sozlamalari:**

| Maydon | Default | Vazifa |
|--------|---------|--------|
| `label_printing_enabled` | `true` | Katalog/Settings stiker UI |
| `default_label_size` | `40x30` | So‘rovda `size` bo‘sh bo‘lsa |
| `label_printer_type` | `TSPL` | Renderer |
| `show_price_on_labels_default` | `true` | Stikerda sotuv narxi |
| `label_gap_mm` | `2.0` | TSPL GAP (mm); `30x20` da default 1.5 |
| `label_direction` | `1` | TSPL DIRECTION `0`\|`1` |

UI: **Sozlamalar → Hardware wizard step 2**; chop: **Katalog → Amallar → Etiketka**.

#### Label stock sizes (kod kontrakti)

| `size` kaliti | TSPL `SIZE` | Tavsiya |
|---------------|-------------|---------|
| `30x20` | 30×20 mm | Mini; nom odatda chiqmaydi, barcode asosiy |
| `40x30` | 40×30 mm | **Standart (XP-365B)** |
| `40x50` | 40×50 mm | Uzunroq etiketka |
| `50x40` | 50×40 mm | Kengroq |
| `58mm` | 58×40 mm | Keng rulon |

Layout prioritet (TSPL): **barcode > narx > nom**.  
Nom: `custom_name_*` bo‘lmasa → `name_uz` / `name_ru`. XP-365B TEXT ASCII-only: kirill avtomatik **lotinga** (`prepare_tspl_label_text`).

API: `POST /api/printing/labels/escpos/`, `labels/queue/escpos/`, `test-label/`.

### 2.3 Barcode scanner — Netum NT-2050

| Band | Qiymat |
|------|--------|
| Mode | USB HID (keyboard wedge) |
| Settings | prefix/suffix (masalan `\t`) |
| Note | Focus har doim skanerga tayyor; COM-serial alohida |

## 3. Print path (Tauri)

```
UI → API (base64 RAW) → printingHub (name/port/model) → Tauri print_raw → Windows spooler
```

- Haqiqiy COM port ochilmaydi; port maydoni = Windows printer **nomi** ichida qidiruv hint.
- Chek va stiker bir xil RAW yo‘li; farq faqat renderer (ESC/POS vs TSPL) va queue nomi.

## 4. Messaging Integrations

Sozlamalarda Telegram va/yoki WhatsApp (Green API / Custom) tanlanadi.

**Telegram:** kunlik Z-report, low-stock, qarz eslatmalari.  
**WhatsApp:** rahmat / elektron chek, qarz eslatma.

## 5. Related docs

- [`docs/FIRST_RUN_ACCEPTANCE_CHECKLIST.md`](docs/FIRST_RUN_ACCEPTANCE_CHECKLIST.md) — first-run + printer smoke.
- [`docs/MONOBLOCK_OPS.md`](docs/MONOBLOCK_OPS.md) — spooler, USB, Defender.
- [`docs/qurilish-mollari/12-printer-etiketka.md`](docs/qurilish-mollari/12-printer-etiketka.md) — qurilish POS chop kontrakti.
