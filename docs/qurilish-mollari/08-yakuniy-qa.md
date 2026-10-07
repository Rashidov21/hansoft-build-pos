# Yakuniy QA checklist (Bosqich 7)

Do‘konga berishdan oldin. Avto-test + qo‘lda smoke.

## Avto-test (CI / lokal)

```bash
cd backend
python -m pytest tests/test_build_scenarios.py tests/test_nakladnoy.py tests/test_build_units.py tests/test_wholesale_price.py tests/test_sales_complete.py tests/test_sales_return_api.py tests/test_debt_payment.py tests/test_reports_and_integrations.py tests/test_sqlite_wal.py tests/test_lan_settings.py -q
```

```bash
node frontend/src/utils/cashChange.test.mjs
```

| Ssenariy | Tekshiruv | Holat |
|----------|-----------|--------|
| S1 to‘liq | nakladnoy stock=0 → complete stock− | ✅ avto |
| S2 ulgurji | `unit_price` wholesale | ✅ avto |
| S3 nasiya | DEBT + customer | ✅ avto |
| S4 bekor | nakladnoy, complete yo‘q | ✅ avto |
| Tezkor + birliklar | dona/kg/m/qop | ✅ avto |
| Qaytim | `calcCashChange` + trim | ✅ avto |
| S5 postavshik | API mavjud (`/api/catalog/suppliers/`) | ✅ saqlangan |
| S6 qaytarish | admin return API | ✅ avto |
| S7 smena/hisobot | reports/integrations testlar | ✅ avto |
| S8 multi-kassa | ops hujjat + WAL/LAN settings | ✅ hujjat/avto |
| Offline | savdo lokal SQLite (internet shart emas) | ✅ arxitektura |
| Seed | `clear_and_seed_build.py --yes` | ✅ |

## Qo‘lda smoke (1 PC)

1. [ ] Seed + login (`cashier` PIN `1111`)
2. [ ] Tezkor to‘lov + naqd qaytim (berilgan > jami)
3. [ ] To‘liq: Nakladnoy chop → Tekshirildi → to‘lov
4. [ ] Ulgurji narx tanlash
5. [ ] Nasiya (ism + tel)
6. [ ] Bekor (picking da) — stock o‘zgarmagan
7. [ ] Admin: qaytarish
8. [ ] Smena (X) ochiladi
9. [ ] (Ixtiyoriy) XP-80C chek/nakladnoy

## Qo‘lda smoke (2-client) — imkon bo‘lsa

[07-multi-kassa-ops.md](./07-multi-kassa-ops.md) jadvali.

## Noma’lum / keyinga

- Brauzerda to‘liq UI E2E avtomat yo‘q — qo‘lda smoke tavsiya.
- 2-client fizik LAN smoke — do‘kon tarmog‘ida.
- Eski `admin.catalog.honey.*` i18n kalit nomlari qolgan (matnlar qurilishga mos); keyinroq rename ixtiyoriy.
