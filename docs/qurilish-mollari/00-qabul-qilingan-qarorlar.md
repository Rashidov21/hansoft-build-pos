# Qabul qilingan qarorlar (P0 manba)

Bu fayl boshqa hujjatlar va kod bilan **ziddiyat bo‘lmasligi** uchun asosiy manba.

## Mahsulot

- Umumiy **Hansoft POS** — ko‘p qurilish mollari do‘konlariga o‘rnatiladi (bitta Ozgen do‘koniga maxsus emas).
- Tillar: `uz`, `uz-cyrl`, `ru` (qirg‘izcha yo‘q).

## MVP (P0) — majburiy

| Band | Qaror |
|------|--------|
| Birlik | `dona`, `kg`, `m`, `qop` — **konversiyasiz** |
| Narx | `list_price` (chakana, majburiy) + `wholesale_price` (ulgurji, **ixtiyoriy**); kassir savdoda tanlaydi |
| Nakladnoy | **A1**: faqat yig‘ish ro‘yxati; qoldiq o‘zgarmaydi; to‘lovda kamayadi |
| Savdo yo‘llari | **To‘liq** (nakladnoy + yig‘ish) **va** **Tezkor** (nakladnoysiz) |
| Qaytim | Naqd: Berilgan → `qaytim = berilgan − to‘lov`; katta UI |
| Nasiya | ism, telefon, muddat, qisman to‘lov tarixi |
| Postavshik | Mavjud AP; UX «bizning qarzimiz» |
| Barcode | Qo‘llab-quvvatlanadi, majburiy emas; etiketka mumkin |
| Tarozi | Yo‘q |
| Printer | XP-80C — nakladnoy + yakuniy chek |
| Smena | Ochish/yopish saqlanadi |
| Hisobot | Telegram + WhatsApp (Green API) |
| Terminal | 1 PC; yirik: 1 server + 1–2 monoblok (LAN) |
| Vozvrat | Mavjud oqim saqlanadi |

## P2 / keyinga (MVP da yo‘q)

- Sevimlilar paneli
- Birlik konversiyasi (`1 qop = 50 kg`) — keyin oson qo‘shiladigan qilib qoldiriladi, lekin hozir **yo‘q**
- Qo‘shimcha birliklar: `m²`, `m³`, `litr`, `tona`
- Qattiq bron (A2)
- Qarz limiti / pudratchi tipi
- 3+ kassa yoki Postgres
- QQS / fiskal chek
- Kassa tortmasi (cash drawer)

## Ssenariylar S1–S8

| # | Daftar | POS | Holat |
|---|--------|-----|-------|
| S1 | Ro‘yxat → yig‘ish → to‘lov | To‘liq yo‘l + naqd qaytim | P0 |
| S2 | Ustaga arzon | Chakana \| Ulgurji | P0 |
| S3 | Nasiya daftari | Nasiya + qisman to‘lov | P0 |
| S4 | Sotmasdan so‘rash | Bekor; qoldiq o‘zgarmaydi | P0 |
| S5 | Mashina keldi | Kirim + postavshik balans | Saqlanadi + matn |
| S6 | Qaytarish | Vozvrat | Saqlanadi |
| S7 | Kun yopish | Smena + TG/WA | Saqlanadi |
| S8 | 2-kassa | LAN multi | Ops |

## Nakladnoy stock qoidasi

**Faqat A1.** Chop etilganda bron yo‘q. Qoldiq faqat savdo yakunida (to‘lov) kamayadi.
