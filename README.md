# Hansoft POS — Qurilish mollari

**Hansoft POS** — qurilish mollari va umumiy chakana do‘konlar uchun offline-first savdo tizimi (Django + React + Tauri).

Daftar o‘rniga: mahsulot, ombor, savdo (to‘liq/tezkor), nasiya, smena, nakladnoy + chek (XP-80C).

## Asosiy model

- Birliklar: `dona` / `kg` / `m` / `qop` (konversiyasiz)
- Narx: chakana majburiy, ulgurji ixtiyoriy (kassir tanlaydi)
- Savdo yo‘llari: **to‘liq** (nakladnoy → yig‘ish → to‘lov) yoki **tezkor** (nakladnoysiz)
- Nakladnoy **A1**: chopda qoldiq o‘zgarmaydi; kamayish faqat to‘lovda
- Naqd **qaytim**: Berilgan → Qaytim
- Nasiya, smena, yetkazib beruvchi, qaytarish, Telegram/WhatsApp — saqlanadi
- Barcode ixtiyoriy; tarozi integratsiyasi yo‘q

## Stack

- Backend: Django + DRF + SQLite
- Frontend: React, TypeScript, Vite, Tailwind, Zustand
- Desktop: Tauri

## Ishga tushirish

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python clear_and_seed_build.py   # demo qurilish katalog
python manage.py runserver 0.0.0.0:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Demo login: `owner` / `admin` / `cashier` — PIN `1111` (seed dan).

## Demo seed

```bash
cd backend
python clear_and_seed_build.py
# yoki: python clear_and_seed_build.py --yes
```

Eski asal demo: `clear_and_seed_honey.py` — **deprecated**, yangi o‘rnatishlarda ishlatilmasin.

## Multi-kassa (1 server + 1–2 client)

Qisqa yo‘riqnoma: [docs/qurilish-mollari/07-multi-kassa-ops.md](docs/qurilish-mollari/07-multi-kassa-ops.md)

- Server `.env`: `GEEKS_POS_BIND_HOST=0.0.0.0` + `DJANGO_ALLOWED_HOSTS=<LAN_IP>`
- Client `.env`: `GEEKS_POS_REMOTE_API=http://<LAN_IP>:8000`

## Hujjatlar

- Qurilish moslash / S1–S8: [docs/qurilish-mollari/](docs/qurilish-mollari/README.md)
