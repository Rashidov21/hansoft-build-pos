# Implementatsiya bosqichlari (gate)

**Qoida:** bir bosqich → to‘xtash → review → tuzatish → foydalanuvchi tasdig‘i → keyingisi.

Batafsil DoD: Cursor reja `build_pos_moslash`.

| Bosqich | Mazmun | Natija |
|---------|--------|--------|
| **0** | Shu papka hujjatlari | ✅ |
| **1** | Birliklar `dona/kg/m/qop` | ✅ |
| **2** | Ulgurji narx | ✅ |
| **3** | Qaytim | ✅ |
| **4** | Nakladnoy + tezkor + S4 | ✅ |
| **5** | Seed / brend / asal tozalash | ✅ |
| **6** | Multi-kassa ops | ✅ |
| **7** | Yakuniy QA S1–S8 + qaytim | ✅ avto + checklist |

## Bosqich 7 DoD

- [x] S1–S4, S6, birliklar, qaytim — avto-test
- [x] S5/S7 saqlangan API + reports test
- [x] S8 ops hujjat
- [x] Checklist: [08-yakuniy-qa.md](./08-yakuniy-qa.md)

## Holat

Barcha bosqichlar yopildi. Qo‘lda 1 PC / 2-client smoke — do‘konda [08](./08-yakuniy-qa.md) bo‘yicha.
