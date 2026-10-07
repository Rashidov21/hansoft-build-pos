# Hansoft POS — Honey Shop

**Hansoft POS** — asal va ari mahsulotlari do‘koni uchun offline-first savdo tizimi (Django + React + Tauri).

Avval telefon/aksessuar POS edi; endi og‘irlik (kg) asosida ishlaydi.

## Asosiy model

- Asal: kategoriya → nav (bitta qoldiq, narx **so‘m/kg**)
- Savdo: tarozidan keyin qo‘lda kg yoki gramm (min **100 g**)
- Ari mahsulotlari: `dona` birligi
- Barcode/stiker chop etish yo‘q — POS da nom bo‘yicha qidiruv
- Nasiya, chegirma (summa), smena, yetkazib beruvchi, chek — saqlanadi
- IMEI / sherik telefon / GB — UI dan olib tashlangan

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
python clear_and_seed_honey.py   # demo asal katalog
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
python clear_and_seed_honey.py
```

Batafsil moslash rejasi: [ASAL_DOKONI_OZGARISHLAR.md](ASAL_DOKONI_OZGARISHLAR.md)
