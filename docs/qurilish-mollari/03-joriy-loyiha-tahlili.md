# Joriy loyiha tahlili (kod holati)

Stack: Django + DRF + SQLite · React/TS/Vite · Tauri. Hozirgi domen: **asal / ari (honey)**.

## Yaroqli yadro (saqlanadi)

| Modul | Imkoniyat |
|-------|-----------|
| `sales` | Savdo, to‘lov (naqd/karta/nasiya), void, refund, idempotency |
| `debt` | Mijoz, qarz, qisman to‘lov, allocation |
| `inventory` | Kirim/chiqim, stocktake, movements |
| `catalog` | Kategoriya, product, variant, barcode, supplier + receipt |
| `expenses` | Smena, xarajat |
| `printing` | Chek, etiketka API, StoreSettings |
| `reports` / `integrations` | X/Z, Telegram, WhatsApp Green API, backup |
| `accounts` | PIN, CASHIER / ADMIN / OWNER |
| `licensing` | Demo / aktivatsiya |

## Asalga bog‘langan (o‘zgartirish kerak)

| Joy | Muammo |
|-----|--------|
| `backend/core/qty.py` | Faqat `kg` / `dona`; min 0.1 kg |
| `frontend/src/utils/qty.ts` | Xuddi shu |
| `PosPage` va boshqa UI | ±0.1 kg, «100 g» matnlari |
| `clear_and_seed_honey.py` | Asal katalog |
| Locales / README | Honey domen |
| `ProductSpecification` | Maishiy texnika merosi — UI da kerak emas |

## MVP uchun bo‘shliqlar (kodda yo‘q yoki zaif)

| Bo‘shliq | Bosqich |
|----------|---------|
| `m`, `qop` birliklari | 1 |
| `wholesale_price` + POS tanlov | 2 |
| Naqd qaytim UI | 3 |
| Draft nakladnoy + tezkor yo‘l | 4 |
| Qurilish seed / brend | 5 |
| Multi-kassa ops hujjat | 6 |

## Baholash

| Qatlam | Holat |
|--------|--------|
| Platforma (offline, smena, hisobot) | Yaxshi |
| Domen (asal → qurilish) | Almashtirish kerak |
| Nasiya / ombor / postavshik | Asosan tayyor |
| Nakladnoy oqimi | Yangi ish |
