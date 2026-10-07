# O‘zgarishlar xaritasi (fayl → nima)

Manba: [00-qabul-qilingan-qarorlar.md](./00-qabul-qilingan-qarorlar.md).  
Bosqichlar: [06-bosqichlar.md](./06-bosqichlar.md).

---

## Bosqich 1 — Birliklar

| Fayl | O‘zgarish |
|------|-----------|
| `backend/core/qty.py` | `dona`, `kg`, `m`, `qop`; validatsiya |
| `frontend/src/utils/qty.ts` | Sync |
| `catalog` models/serializers/services | unit choices |
| `sales` / `inventory` | validate_sale_qty |
| `PosPage`, `CatalogPage`, `InventoryPage`, `ReturnSalePage` | unit UI / ± step |
| `locales` uz/ru | `unit.*` |
| `backend/tests/*` | yangilash |

## Bosqich 2 — Ulgurji

| Fayl | O‘zgarish |
|------|-----------|
| `catalog/models.py` | `wholesale_price` nullable |
| Catalog UI | maydon |
| `PosPage.tsx` | Chakana \| Ulgurji |
| serializers | expose field |

## Bosqich 3 — Qaytim

| Fayl | O‘zgarish |
|------|-----------|
| `PosPage.tsx` | Berilgan → Qaytim |
| locales | `pay.tendered` / `pay.change` |
| `receipt.py` (ixtiyoriy) | chekda Berilgan/Qaytim |

## Bosqich 4 — Nakladnoy

| Fayl | O‘zgarish |
|------|-----------|
| `printing/receipt.py` + `views` / `urls` | A1: savatdan nakladnoy ESC/POS (Sale DRAFT yo‘q) |
| `PosPage.tsx` | idle → picking → ready; tezkor to‘lov; bekor |
| `api.ts` / `printingHub.ts` | `nakladnoy/escpos` chop |
| inventory | stock faqat `complete_sale` |

## Bosqich 5 — Seed / brend

| Fayl | O‘zgarish |
|------|-----------|
| `clear_and_seed_build.py` | qurilish demo katalog (dona/kg/m/qop + ulgurji) |
| `clear_and_seed_honey.py` | deprecated |
| `README.md` | qurilish POS |
| locales | asal/honey ko‘rinadigan matnlar tozalandi |
| Suppliers/Returns | postavshik / qaytarish atamalari |

## Bosqich 6 — Multi-kassa

| Joy | O‘zgarish |
|-----|-----------|
| docs (shu papka yoki `docs/MONOBLOCK_OPS.md`) | LAN: server bind, client URL, firewall, SQLite WAL |

## Tegilmasin (asosiy refaktor yo‘q)

`licensing/*`, debt FIFO allocation, sales idempotency, notification queue mantiqi, Tauri hardware ID.
