# Sharoit va ish jarayoni (daftar → POS)

## 1. Maqsad auditoriya

- Kichik/o‘rta qurilish mollari do‘konlari (daftarda hisob yuritadigan, tizimlashmagan).
- Xodimlar ko‘pincha POS ko‘rmagan.
- Internet barqaror emas → **offline-first**.
- 1 kompyuter yetadi; yirikroq do‘konda 1 asosiy PC (server) + 1–2 monoblok kassa.

## 2. Daftardagi kunlik oqim

1. Do‘kon ochiladi, naqd sanash (smena).  
2. Mijoz **ro‘yxat** bilan keladi.  
3. Narx aytiladi (usta bo‘lsa arzonroq — ulgurji).  
4. Tovarlar **yig‘iladi**, ro‘yxat bilan tekshiriladi.  
5. To‘lov: naqd (qaytim) / karta / nasiya.  
6. Daftarga yoziladi (ayniqsa qarz).  
7. Kun oxiri: hisob, egaga xabar.

## 3. POS ga map (S1–S8)

| # | Daftar | POS |
|---|--------|-----|
| S1 | Ro‘yxat → yig‘ish → to‘lov | To‘liq: nakladnoy → yig‘ish → to‘lov + qaytim |
| S2 | Ustaga arzon | Chakana \| Ulgurji |
| S3 | Nasiya daftari | Nasiya + qisman to‘lov tarixi |
| S4 | «Qancha?» (sotmasdan) | Savat/draft bekor |
| S5 | Mashina keldi | Ombor kirim + postavshik qarz |
| S6 | Qaytarish | Vozvrat |
| S7 | Kun yopish | Smena + Telegram/WhatsApp |
| S8 | 2-kassa | LAN: 1 server + clientlar |

## 4. Ikki savdo yo‘li

```
To‘liq:  Savat → Nakladnoy (chop, stock yo‘q) → Yig‘ish → Tekshiruv → To‘lov → Stock −
Tezkor:  Savat → To‘lov → Stock −
```

Nakladnoy **majburiy emas** (kichik counter savdo uchun tezkor yo‘l).

## 5. Offline qoida

- Internetsiz: savdo, ombor, nasiya, smena, chek/nakladnoy chop.  
- Internet: Z-hisobot TG/WA, remote backup, litsenziya online check (offline grace saqlansin).  
- Hisobot yuborilmasa ham savdo to‘xtamasin.

## 6. UX printsiplari

- Birinchi ekran = **Savdo**.  
- Oddiy o‘zbekcha: Savdo, Ombor, Qarz, Kirim, Hisobot.  
- Katta tugmalar; barcode yordamchi.  
- Xato = tushunarli yo‘l ko‘rsatish.
