# Qurilish mollari — Hansoft POS (hujjatlar manbasi)

Bu papka **umumiy** Hansoft POS mahsulotini qurilish mollari do‘konlariga moslash uchun **yalagiz manba** (tasdiqlangan qarorlar).

Implementatsiya: reja bosqichlari `build_pos_moslash`. Demo seed: `backend/clear_and_seed_build.py`.

## Tasdiqlangan sharoit

| Band | Qaror |
|------|--------|
| Mahsulot | Ko‘p do‘konga o‘rnatiladigan umumiy POS |
| Tillar | `uz`, `uz-cyrl`, `ru` |
| Offline | Savdo/ombor/nasiya internetsiz; hisobot (TG/WA) uchun internet |
| Xodimlar | 2–15; terminal: 1 PC yoki 1 server + 1–2 monoblok |
| Foydalanuvchi | Kompyuter/POS dan bexabar — sodda UX |
| Tarozi | Yo‘q |
| Barcode | Bor, **majburiy emas**; etiketka mumkin |
| Printer | XP-80C termochek (nakladnoy + chek) |
| Hisobot | Telegram + WhatsApp (Green API) |

## Hujjatlar

| Fayl | Mazmuni |
|------|---------|
| [00-qabul-qilingan-qarorlar.md](./00-qabul-qilingan-qarorlar.md) | P0/P2, S1–S8, ikki savdo yo‘li, qaytim |
| [01-imkoniyatlar-royxati.md](./01-imkoniyatlar-royxati.md) | Imkoniyatlar (faqat tasdiqlangan prioritet) |
| [02-sharoit-va-ish-jarayoni.md](./02-sharoit-va-ish-jarayoni.md) | Daftar → POS ish jarayoni |
| [03-joriy-loyiha-tahlili.md](./03-joriy-loyiha-tahlili.md) | Kod bazasi holati |
| [04-ozgarishlar-xaritasi.md](./04-ozgarishlar-xaritasi.md) | Fayl/modul bo‘yicha o‘zgarishlar |
| [05-ux-va-soddalashtirish.md](./05-ux-va-soddalashtirish.md) | UX qoidalari |
| [06-bosqichlar.md](./06-bosqichlar.md) | Bosqich 0–7, gate (tasdiq) tartibi |
| [07-multi-kassa-ops.md](./07-multi-kassa-ops.md) | S8: 1 server + 1–2 client (LAN, WAL, firewall) |
| [08-yakuniy-qa.md](./08-yakuniy-qa.md) | Bosqich 7: S1–S8 + qaytim checklist |

## Asosiy savdo oqimi

**To‘liq:** ro‘yxat → savat → nakladnoy (XP-80C) → yig‘ish → tekshiruv → to‘lov (+ naqd qaytim) → qoldiq −  

**Tezkor:** ro‘yxat → savat → to‘lov (+ qaytim) → qoldiq − (nakladnoysiz)

Nakladnoy = **A1**: chopda qoldiq o‘zgarmaydi; kamayish faqat yakuniy to‘lovda.
