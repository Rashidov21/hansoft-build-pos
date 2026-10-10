# Printer va etiketka — kod kontrakti (B1–B3)

**Sana:** 2026-10-10  
**Maqsad:** Chek matnlari, stiker o‘lchamlari va chop oqimini bitta joyda qayd etish (implementatsiya: B1 backend, B2 Settings, B3 Katalog).

## 1. Qurilmalar

| Rol | Model | Protokol | UI |
|-----|--------|----------|-----|
| Chek / nakladnoy | XP-80C | ESC/POS | Sozlamalar wizard **step 1**, POS avto/reprint |
| Stiker | XP-365B | TSPL | Sozlamalar wizard **step 2**, Katalog Amallar |
| Skaner | NT-2050 HID | Keyboard | Wizard **step 3** |

Batafsil: [`HARDWARE_CONFIG.md`](../../HARDWARE_CONFIG.md).

## 2. Chek matnlari (manba)

| Parametr | StoreSettings | UI |
|----------|---------------|-----|
| Do‘kon nomi, tel, manzil, footer | `brand_name`, `phone`, `address`, `footer_note` | Sozlamalar → Do‘kon |
| Til / translit | `receipt_lang`, `transliterate_uz`, `encoding` | Do‘kon |
| Eni / shrift | `receipt_width`, `receipt_font_size` | Wizard step 1 |
| Yoqish / avto | `receipt_printing_enabled`, `auto_print_on_sale` | Wizard + checkbox |
| Printer | `receipt_printer_name/type/port` | Wizard step 1 |

## 3. Stiker (manba)

| Parametr | StoreSettings / request | UI |
|----------|-------------------------|-----|
| Yoqish | `label_printing_enabled` | Sozlamalar checkbox |
| Default o‘lcham | `default_label_size` (`40x30`) | Wizard step 2; Katalog prefill |
| So‘rov o‘lchami | `size` ∈ `30x20\|40x30\|40x50\|50x40\|58mm` | Katalog modal |
| Nusxa | `copies` 1–200 | Katalog modal |
| Narx | `show_price` / `show_price_on_labels_default` | Wizard + modal |
| Printer | `label_printer_name/type/port` | Wizard step 2 |
| Nom qatori | `custom_name_*` → `name_uz`/`name_ru` | TSPL: to‘liq kirill→lotin (`prepare_tspl_label_text`); glyph kirill yo‘q |

Barcode bo‘sh bo‘lsa Katalog chop **bloklanadi** (avval barcode kerak).

## 4. Oqimlar

```
Sozlamalar test chek  → test-receipt → print_raw (receipt queue)
Sozlamalar test stiker → saqlash → test-label → dispatchLabel
Katalog reprint       → labels/escpos → dispatchLabel
POS sotuv chek        → receipt/escpos → dispatchReceipt (agar enabled + auto)
```

## 5. Qabul checklist (qisqa)

- [ ] Step 1: XP-80C tanlash, test chek chiqadi  
- [ ] Step 2: XP-365B, `40x30`, test stiker chiqadi  
- [ ] Katalog → Amallar → Etiketka: 1 va 5 nusxa  
- [ ] Stiker o‘chiq → Katalogda punkt yo‘q  
- [ ] Barcodesiz tovar → Chop disabled / xato  
- [ ] Chek matnlari (brand/footer) saqlangandan keyin chekda ko‘rinadi  

To‘liq first-run: [`../FIRST_RUN_ACCEPTANCE_CHECKLIST.md`](../FIRST_RUN_ACCEPTANCE_CHECKLIST.md).

## 6. Keyingi fazalar (kod)

| ID | Mazmun |
|----|--------|
| B5 | Monoblokda real printer smoke (shu checklist) |
| B6 | ✅ TSPL kirill→lotin translit (ASCII TEXT). Bitmap glyph — ixtiyoriy keyinroq |
| B7 | ✅ Ombor kirimidan keyin «Stiker chop etilsinmi?» |
| B8 | ✅ Katalog multi-select + queue chop |
| B9 | ✅ Kassir: label API + Ombor qoldiqda Tags reprint |
| B10 | ✅ `label_gap_mm` / `label_direction` (Settings step 2) |
