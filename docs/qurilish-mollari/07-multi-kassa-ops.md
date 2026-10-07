# Multi-kassa ops (S8) — 1 server + 1–2 client

Qurilish mollari do‘konida **bitta SQLite baza** (serverda) va 1–2 monoblok kassa.

Bog‘liq: [`docs/MONOBLOCK_OPS.md`](../MONOBLOCK_OPS.md), [`docs/PRODUCTION_POST_INSTALL.md`](../PRODUCTION_POST_INSTALL.md).

## Arxitektura

```
[Server PC]  Hansoft POS + waitress (LAN) + db.sqlite3
      │
      │  http://192.168.x.x:8000
      │
 ┌────┴────┐
[Kassa 1]  [Kassa 2]   (GEEKS_POS_REMOTE_API → server)
```

- **Server**: DB faqat shu mashinada; backend LAN ga ochiladi; TG/WA queue flush shu yerda.
- **Client**: lokal backend **ishga tushmaydi**; UI server API ga ulanadi; background flush o‘tkazib yuboriladi.
- **Ikki alohida DB** (ikki to‘liq o‘rnatish) — **qo‘llab-quvvatlanmaydi** (ombor chalkashadi).

## SQLite cheklovlari (muhim)

| Qoida | Izoh |
|-------|------|
| Bitta yozuvchi | SQLite bir vaqtda bitta write; WAL (`PRAGMA journal_mode=WAL`) parallel o‘qishga yordam beradi |
| 1–2 kassa | MVP uchun yetarli; 5+ kassa uchun keyinroq PostgreSQL ko‘rib chiqiladi |
| Tarmoq disk | DB ni NAS/USB share ga qo‘ymang — buzilish xavfi |
| UPS | Serverda UPS tavsiya etiladi |
| `database is locked` | Client sonini kamaytiring; serverda bitta backend jarayoni |

WAL avtomatik yoqiladi: `backend/core/apps.py` → `PRAGMA journal_mode=WAL` + `busy_timeout=30000`.

## 1) Server sozlash

1. Hansoft POS ni server PC ga o‘rnating (oddiy 1-kassa kabi).
2. Server LAN IP ni biling (masalan `192.168.1.10`).
3. `%APPDATA%\GeeksPOS\.env` (yoki shortcut Environment):

```env
GEEKS_POS_BIND_HOST=0.0.0.0
DJANGO_ALLOWED_HOSTS=192.168.1.10,127.0.0.1,localhost
```

4. Windows Firewall: inbound **TCP 8000** (yoki o‘rnatilgan `add-firewall-rule-admin.bat` + LAN uchun qo‘lda port).
5. Ilovani qayta ishga tushiring.
6. Serverning o‘zida tekshiring:
   - Brauzer: `http://127.0.0.1:8000/api/health/` → `{"status":"ok",...}`
   - Boshqa qurilmadan: `http://192.168.1.10:8000/api/health/`

### Dev / qo‘lda waitress

```bash
cd backend
set GEEKS_POS_BIND_HOST=0.0.0.0
set DJANGO_ALLOWED_HOSTS=192.168.1.10,127.0.0.1,localhost
python run_waitress.py --host 0.0.0.0 --port 8000
```

## 2) Client (monoblok) sozlash

1. Clientga ham Hansoft POS o‘rnating (UI kerak).
2. Shortcut yoki `%APPDATA%\GeeksPOS\.env`:

```env
GEEKS_POS_REMOTE_API=http://192.168.1.10:8000
```

3. Ilovani oching — lokal backend spawn **o‘tkazib yuboriladi**, health serverdan tekshiriladi.
4. Login: serverdagi user/PIN (masalan seed: `cashier` / `1111`).

Agar ulanish bo‘lmasa: IP, firewall, server ishlayotganini, `DJANGO_ALLOWED_HOSTS` ni tekshiring.

## 3) Smoke checklist (2-client)

| # | Qadam | Kutilgan |
|---|--------|----------|
| 1 | Server `/api/health/` | 200 ok |
| 2 | Client1 login | OK |
| 3 | Client2 login | OK |
| 4 | Client1 tezkor savdo | Stock −, historyda ko‘rinadi |
| 5 | Client2 bir xil mahsulot qoldig‘ini ko‘radi | Yangilangan stock |
| 6 | Client2 to‘liq: nakladnoy → tekshiruv → to‘lov | Stock faqat to‘lovda − |
| 7 | Serverda backup | `%APPDATA%\GeeksPOS\db.sqlite3` (+ `-wal`/`-shm` bo‘lishi mumkin) |

## Xavfsizlik eslatma

- LAN ichida ochiq API — faqat do‘kon tarmog‘i.
- Internetga port forward **qilmang**.
- Productionda `DJANGO_SECRET_KEY` va litsenziya kalitlarini `.env` da saqlang.

## Env qisqa jadval

| O‘zgaruvchi | Qayerda | Ma’nosi |
|-------------|---------|---------|
| `GEEKS_POS_BIND_HOST` | Server | `0.0.0.0` = LAN tinglash |
| `DJANGO_ALLOWED_HOSTS` | Server | Server LAN IP (vergul bilan) |
| `GEEKS_POS_REMOTE_API` | Client | `http://SERVER_IP:8000` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Ixtiyoriy | Qo‘shimcha originlar |

## 1 PC (multi-kassasiz)

Hech narsa o‘zgartirmang — default `127.0.0.1`, oddiy monoblok.
