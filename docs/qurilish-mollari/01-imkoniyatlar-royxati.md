# Imkoniyatlar ro‘yxati (tasdiqlangan prioritet)

Manba: [00-qabul-qilingan-qarorlar.md](./00-qabul-qilingan-qarorlar.md)

**P0** = MVP · **P1** = keyinroq (reja tashqarida emas, lekin birinchi versiyadan keyin) · **P2** = ixtiyoriy

---

## Katalog

| # | Imkoniyat | Prioritet |
|---|-----------|-----------|
| 1.1 | Kategoriyalar + mahsulot + variant | P0 |
| 1.2 | Birlik: `dona`, `kg`, `m`, `qop` | P0 |
| 1.3 | Birlik konversiyasi | P2 |
| 1.4 | Barcode (ixtiyoriy) + etiketka | P0 (qo‘llab-quvvatlash) |
| 1.5 | Nom bo‘yicha qidiruv | P0 |
| 1.6 | Sevimlilar paneli | P2 |
| 1.7 | Chakana narx (majburiy) | P0 |
| 1.8 | Ulgurji narx (ixtiyoriy maydon) | P0 |
| 1.9 | Minimal qoldiq ogohlantirish | P1 (kodda qisman bor) |
| 1.10 | `m²`, `m³`, `litr`, `tona` | P2 |

---

## Savdo (POS)

| # | Imkoniyat | Prioritet |
|---|-----------|-----------|
| 2.1 | Offline savdo | P0 |
| 2.2 | Tezkor yo‘l (nakladnoysiz to‘lov) | P0 |
| 2.3 | To‘liq yo‘l: nakladnoy → yig‘ish → to‘lov | P0 |
| 2.4 | Nakladnoy A1 (chopda stock o‘zgarmaydi) | P0 |
| 2.5 | Naqd / karta / nasiya / aralash | P0 |
| 2.6 | Naqd **qaytim** (Berilgan → Qaytim) | P0 |
| 2.7 | Chegirma (summa) | P0 (bor) |
| 2.8 | Chegirma % | P1 |
| 2.9 | Yakuniy chek (XP-80C) | P0 |
| 2.10 | S4 bekor (qoldiqqa tegmasdan) | P0 |
| 2.11 | Void / qaytarish | P0 (bor) |
| 2.12 | Qattiq bron (A2) | P2 |

---

## Ombor / postavshik / nasiya

| # | Imkoniyat | Prioritet |
|---|-----------|-----------|
| 3.1 | Kirim, adjust, stocktake, harakat | P0 (bor) |
| 3.2 | Postavshik + balans (bizning qarz) | P0 (bor + UX) |
| 3.3 | Mijoz nasiya: ism, tel, muddat, qisman to‘lov | P0 |
| 3.4 | Qarz limiti | P2 |
| 3.5 | Ko‘p ombor joyi | P2 |

---

## Operatsiya / hisobot

| # | Imkoniyat | Prioritet |
|---|-----------|-----------|
| 4.1 | PIN, rollar (Kassir/Admin/Egasi) | P0 |
| 4.2 | Smena ochish/yopish, X/Z | P0 |
| 4.3 | Telegram + WhatsApp kunlik hisobot | P0 |
| 4.4 | Backup | P0 |
| 4.5 | 1 PC yoki 1 server + 1–2 kassa | P0 |
| 4.6 | QQS / fiskal | P2 (hozir kerak emas) |
| 4.7 | Kassa tortmasi | P2 (hozir kerak emas) |

---

## MVP qisqa checklist

1. 4 birlik, chakana + ixtiyoriy ulgurji  
2. To‘liq + tezkor savdo; nakladnoy A1; qaytim  
3. Nasiya, ombor, postavshik, vozvrat, smena  
4. Barcode ixtiyoriy, XP-80C, TG/WA  
5. Offline + sodda UX  
