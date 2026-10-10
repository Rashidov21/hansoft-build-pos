# Jiddiy / hisobot / mayda xatolar — kod tekshiruvi va yechimlar

**Sana:** 2026-10-10  
**Manba:** finger-test topilmalari (jiddiy + hisobot + mayda)  
**Qamrov:** tahlil + yechim; **P0a–P2 kodga qo‘llandi** (H6 data command / banklar — keyin)  
**Holat belgisi:** ✅ tasdiqlandi · ⚠️ qisman / bog‘liq · ℹ️ kontekst (kod xatosi emas) · 🔧 kodlandi

---

## Qisqa xulosa

Ko‘pchilik topilmalar kodda **tasdiqlandi**. Asosiy ildizlar:

1. Decimal qoldiq / narx migratsiyasidan keyin ba’zi so‘rovlar hali Integer/int bilan ishlaydi.
2. Kassir uchun POS narx API’si ochiq; sotuvda `unit_price` cheklanmagan.
3. Sotuv ↔ smena bog‘lanmagan (`Sale.shift` yo‘q).
4. Dashboard void/refund hisobida ikki marta ayirish.
5. Scheduler `django.setup()` / `ready()` da migratsiyadan oldin ishga tushadi.

---

# 🔴 Jiddiy xatolar

## J1. Port to‘qnashuvi — boshqa Hansoft ham `:8000`

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi |
| **Joy** | `src-tauri/src/main.rs` → `health_ok_at`, `pick_backend_port`; health: `backend/core/urls.py` |
| **Sabab** | Health faqat HTTP 200 + `"status":"ok"` ni tekshiradi. `"service":"geeks-pos-api"` tekshirilmaydi. Boshqa Hansoft/POS ham shu JSON ni bersa, launcher «o‘z backend» deb qabul qiladi va yangi jarayon ochmaydi yoki noto‘g‘ri portda UI ulanadi. |

### Yechim

1. `health_ok_at` da body ichida `"service":"geeks-pos-api"` (yoki loyihaga xos aniq identifikator) majburiy bo‘lsin.
2. `pick_backend_port`: preferred portda **boshqa** service javob bersa — band deb hisobla, boshqa bo‘sh port tanla; o‘z service bo‘lsa — shu portdan foydalan.
3. (Ixtiyoriy) Build POS uchun alohida default port yoki `HANSOFT_BUILD_API_PORT` env.
4. QA: bir mashinada ikki Hansoft — ikkinchisi chalkashmasligi kerak.

---

## J2. «Мало остатка» / low-stock / by-brand → 500

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi |
| **Joy** | `backend/catalog/low_stock.py` (`get_low_stock_by_brand`, `get_low_stock_by_model`); URL: `catalog/low-stock/`, `.../by-brand/` |
| **Sabab** | `stock_qty` DecimalField (migratsiya `0015_honey_decimal_qty_unit`). Aggregatsiyada `Coalesce(Sum("stock_qty"), 0)` — `0` Integer. Django: *Expression contains mixed types: DecimalField, IntegerField*. Oddiy `stock_qty__lt=threshold` filtri odatda o‘tadi; **by-brand / by-model** (va summary orqali shu yo‘l) yiqiladi. |

### Yechim

1. `Coalesce(Sum(...), Value(0, output_field=DecimalField(...)))` — yoki `Decimal("0")` + aniq `output_field`.
2. `threshold` tipini ham `Decimal` qilib bir xillashtirish (`get_low_stock_by_brand` hali `int | None` annotated).
3. Regression test: low-stock list + by-brand + by-model 200.
4. Frontend/Telegram low-stock hisobot yo‘lini shu endpointlar bilan qayta smoke qilish.

---

## J3. Sotilgan chekda narx o‘zgartirish — doim «Invalid price format»

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi |
| **Joy** | `backend/sales/views.py` → `SaleLinePriceEditView` (~691) |
| **Sabab** | `_q(...)` chaqiriladi, lekin views da import yo‘q (`sales.services._q` mavjud). `NameError` `except Exception` ichida ushlanadi → `INVALID_PRICE` / «Invalid price format». |

### Yechim

1. `from .services import _q` (yoki umumiy money helper) — views ga import.
2. Format xatosini `InvalidOperation` / `ValueError` bilan cheklash; `NameError` ni yutib yubormaslik.
3. Test: admin PATCH line price → 200 va yangi jami.

---

## J4. Kassir katalogdagi sotish narxini o‘zgartira oladi

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi |
| **Joy** | `PosVariantPriceView` — `permission_classes = [IsAuthenticated, IsCashier]`; oddiy variant tahrir — `IsAdminOrOwner` (403) |
| **Sabab** | `variants/<id>/pos-price/` kassir (va admin/owner — `IsCashier` ichida) uchun ochiq. `PosPriceUpdateSerializer` da pastki chegara yo‘q. |

### Yechim

1. Ruxsatni `IsAdminOrOwner` ga tortish **yoki** sozlamada «kassir POS narxini o‘zgartira oladi» flag + default **off**.
2. Agar kassirga vaqtincha chegirma kerak bo‘lsa — faqat **shu chek** `unit_price` (katalog `list_price` ni emas).
3. Audit: kim, qachon, eski/yangi narx (hozir log bor — saqlansin).
4. QA: kassir bilan pos-price → 403; admin → 200.

---

## J5. Istalgan / tannarxdan past narxda sotuv

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi |
| **Joy** | `backend/sales/services.py` → `complete_sale` (`unit_price` clientdan qabul); frontend `PosPage` savat narxi |
| **Sabab** | Backend `unit_price` ni deyarli cheklamaydi (manfiy line_discount dan boshqa). Tannarx (`purchase_price`) bilan solishtirish yo‘q. Kassir ham, admin ham ogohlantirishsiz past narxda sota oladi. |

### Yechim

1. **Kassir:** `unit_price` ni katalog `list_price` / `wholesale_price` dan pastga tushirishni backendda rad etish (yoki faqat admin PIN/tasdiq).
2. **Admin:** tannarxdan past → ogohlantirish + aniq tasdiq (`confirm_below_cost: true`); ixtiyoriy soft-block.
3. Bonus qatorlar alohida qoida (0 so‘m ruxsat).
4. UI: qizil/ogohlantirish; backend — yagona haqiqat manbai.
5. Test: kassir 5 so‘m → 400; admin tasdiqsiz → 400; tasdiq bilan → 200.

---

## J6. Smenasiz sotuv; sotuv smenaga bog‘lanmaydi

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi |
| **Joy** | `sales/models.py` → `Sale` da `shift` / `shift_id` yo‘q; `complete_sale` ochiq smena tekshirmaydi |
| **Sabab** | Smena (`expenses.Shift`) alohida; sotuv faqat `cashier` + `completed_at`. UI login da smena ochishi mumkin, lekin API majburiy emas. |

### Yechim

1. Migratsiya: `Sale.shift` FK (`null` eski qatorlar uchun), indekslash.
2. `complete_sale`: joriy foydalanuvchining **OPEN** smenasi bo‘lmasa → `NO_OPEN_SHIFT` (sozlamada «smena majburiy» default on).
3. Yangi sotuvlarga `shift_id` yozish; X/Z va xarajat hisoboti shu FK orqali.
4. Smena yopiq / yo‘q holatda POS to‘lovni bloklash (frontend + backend).
5. Migratsiya strategiyasi: eski sotuvlar `shift=null`; hisobotlarda «smenasiz» filtri.

---

## J7. O‘chirilgan / nofaol Telegram kanalga hisobot

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi (qayta faollashtirish) |
| **Joy** | `integrations/report_routing.py` → `ensure_channels_from_legacy`; smena yopish → `send_daily_z_report` |
| **Sabab** | `get_route_channels` `is_active=True` filtrlaydi. Lekin `ensure_channels_from_legacy()` chaqirilganda legacy `telegram_chat_id` bo‘lsa, topilgan kanalni **`is_active = True` qilib qayta yoqadi**. Nofaollashtirilgan kanal smena yopilganda yana jonlanadi. |

### Yechim

1. Legacy sync **nofaol** kanalni qayta yoqmasin; faqat manzil yangilanishi yoki umuman sync qilmasin.
2. Kanal o‘chirilganda / `is_active=False` da `IntegrationSettings.telegram_chat_id` ni tozalash yoki syncni bir tomonlama qilish.
3. Route’dan nofaol kanallarni ajratish (M2M da qolsa ham yuborilmasin — hozir filter bor, lekin qayta-activate buzadi).
4. QA: kanal nofaol → smena yopish → yuborilmasin, kanal yana active bo‘lmasin.

---

# 🟠 Hisobot va hisob-kitob

## H1. Dashboard’da manfiy karta summasi (void dan keyin)

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi |
| **Joy** | `backend/reports/services.py` → `sales_metrics` |
| **Sabab** | `today_card_in` faqat **COMPLETED** sotuvlardan. Void qilinsa to‘lov «yo‘qoladi». Shu bilan birga `void_sale` `SaleRefund` yaratadi → `today_refund_card` oshadi. Natija: `today_card_total = card_in - refund` = **ikki marta ayirish** (masalan 0 − 30 000 = −30 000; kutilgan 40 000 boshqa sotuvlar bilan). X-hisobot faqat completed `sale_ids` bo‘yicha matched refund oladi — shu sabab X to‘g‘ri. |
| **Qo‘shimcha** | `today_cash_net_flow` ham `today_cash_total` (allaqachon net) dan yana `today_refund_cash` ayiradi — naqd oqimida ham ikki marta. |

### Yechim

1. Aniq qoida tanlash (bittasi):
   - **A)** Void qilingan sotuv to‘lovlari completed dan chiqadi — unda void uchun `SaleRefund` ni **kunlik usul net** ga kiritma (yoki alohida `void_refund` flag).
   - **B)** Refundlarni hisobga ol — unda void qilingan sotuvning asl CARD/CASH to‘lovini ham «gross in» ga qo‘sh (yoki faqat net refundsiz completed).
2. Tavsiya: kunlik `today_*_total` = completed to‘lovlar − **faqat partial return** refundlari; void alohida `today_void_*` KPI.
3. `today_cash_net_flow` da refundni ikki marta ayirmaslik.
4. Test: 70k karta, 30k void → `today_card_total == 40000`.

---

## H2. Qarzli sotuv qaytarilganda `return_status` yangilanmaydi

| | |
|---|---|
| **Holat** | ✅ / ⚠️ (ildiz aniq; qarz vs naqd farqi test bilan mustahkamlanadi) |
| **Joy** | `backend/sales/history_meta.py` → `build_history_return_meta` |
| **Sabab** | Sotilgan miqdor `int(Sum("qty"))` — Decimal qoldiqdan keyin **kesiladi** (`0.5` → `0` → doim `return_status: "none"`). `remaining` esa `Decimal`. Tip/kesish nomuvofiqligi naqd/qarz bo‘yicha turli qty stsenariylarda «faqat naqdda full» kabi ko‘rinishi mumkin. Qaytarish harakatlari o‘zi `return_sale_lines` da bor. |

### Yechim

1. `sold` ni ham `Decimal` qilib `remaining_return_units_by_sale_ids` bilan bir xil hisoblash (bonus qoidasi bir xil).
2. `int(...)` ni olib tashlash.
3. Testlar: naqd full return → `full`; qarz full return → `full`; kasr qty partial → `partial`.

---

## H3. Qaytarishni bekor qilganda qarz tiklanmaydi

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi |
| **Joy** | `backend/sales/archive_services.py` → `reverse_return_movement` |
| **Sabab** | Faqat ombor OUT + `reversed_at`. `SaleRefund` / `Debt.remaining_amount` / `total_amount` qayta tiklanmaydi. Javobda `refund_manual_required: true` — pul/qarz qo‘lda. |

### Yechim

1. Qaytarish bekorida tegishli `SaleRefund` yozuvlarini reverse qilish (yoki kompensatsiya yozuvi).
2. DEBT refund bo‘lsa — `Debt.total_amount` / `remaining_amount` / `status` ni qaytarish oldingi holatga yaqinlashtirish (FIFO ehtiyot).
3. CASH/CARD uchun ham aniq qoida: avtomatik reverse yoki majburiy kassa amali + UI.
4. `refund_manual_required` ni faqat chindan qo‘lda kerak bo‘lganda qoldirish.
5. Test: qarzli sotuv → return DEBT → reverse → qarz qayta OPEN va summa to‘g‘ri.

---

## H4. Xarajat smenaga bog‘lanmaydi

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi |
| **Joy** | `expenses/serializers.py` → `ShopExpenseSerializer.create` |
| **Sabab** | `related_shift` maydoni bor, lekin create da ochiq smena avtomatik qo‘yilmaydi; client odatda yubormaydi → `null`. Smena summary xarajatni 0 ko‘rsatadi. |

### Yechim

1. Create paytida foydalanuvchining OPEN smenasini avtomatik `related_shift` ga yozish.
2. Ochiq smena yo‘q bo‘lsa: rad etish yoki aniq «smenasiz xarajat» ruxsati (biznes qarori).
3. Eski `null` qatorlar uchun ixtiyoriy backfill (`recorded_at` ∈ smena oynasi).
4. Test: ochiq smenada xarajat → shift summary > 0.

---

## H5. Manfiy narx qabul qilinadi

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi |
| **Joy** | `PosPriceUpdateSerializer`, bulk/create serializerlar, modelda narx uchun CheckConstraint yo‘q |
| **Sabab** | `DecimalField` manfiyni qabul qiladi; `min_value=0` yo‘q. |

### Yechim

1. Serializerlarda `purchase_price` / `list_price` / `wholesale_price` uchun `min_value=0`.
2. Model `CheckConstraint` (ixtiyoriy, DB daraja).
3. `complete_sale` da `unit_price < 0` → xato.
4. Test: −5 / −1 → 400.

---

## H6. Eski tovarlar «kg» bo‘lib qolgan

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi |
| **Joy** | `catalog/migrations/0015_honey_decimal_qty_unit.py` — `unit` default=`'kg'` |
| **Sabab** | Yangi ustun default `kg`. Telefon/dona katalogdagi barcha mavjud qatorlar `kg` bo‘ldi. Model default endi `dona`, lekin DB dagi eski qiymatlar o‘zgarmagan. |

### Yechim

1. Bir martalik data migratsiya / management command: qurilish mollari emas, **dona** bo‘lishi kerak bo‘lgan SKU larni `dona` ga (qoida: barcha `unit='kg'` va kasr qoldiq ishlatilmagan / telefon merosi — mahsulot siyosatiga qarab).
2. Qurilish demo seed allaqachon to‘g‘ri unit beradi; production DB uchun aniq mapping jadvali.
3. Yangi maydon default `dona` ekanini migratsiya hujjatida qayd (qayta o‘rnatishda takrorlanmasin).
4. QA: telefon/dona tovarlar birligi to‘g‘ri; haqiqiy kg/m/qop tegmasin.

---

## H7. Vaqt mintaqasi noto‘g‘ri (+05 vs +06, nakladnoy UTC)

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi (kod + sozlama) |
| **Joy** | `TIME_ZONE = "Asia/Tashkent"` (`config/settings.py`); banklar MBANK/BAKAI; nakladnoy: `printing/receipt.py` → `datetime.now(timezone.utc).astimezone()`; chopda `created_at[:19]` offsetni kesadi |
| **Sabab** | Django Toshkent (+05). OS/kompyuter +06 bo‘lsa, stdlib `astimezone()` OS ga qarab ketadi. UTC ISO ni `[:19]` qilib chop etish — devorda UTC soat ko‘rinadi (23:16 o‘rniga 17:16). Avto Z 23:00 — `timezone.localtime()` (Django TZ); OS farqi kun chegarasini chalkashtirishi mumkin. Bank ro‘yxati mahsulot qarori (KG merosi). |

### Yechim

1. Nakladnoy/chek vaqtini `django.utils.timezone.localtime()` bilan olish (OS emas, `TIME_ZONE`).
2. Chop/UI da offsetni kesib tashlamasdan **lokal** `YYYY-MM-DD HH:MM` formatlash.
3. O‘rnatish hujjati: Windows TZ = do‘kon mintaqasi; yoki faqat Django TZ ga tayaniladi deb yozish.
4. Bank ro‘yxatini bozor bo‘yicha (UZ) almashtirish — alohida mahsulot qarori.
5. QA: nakladnoy vaqti Toshkent bilan mos; Z 23:00 mahalliy.

---

## H8. Yangilanishdan keyin birinchi ishga tushishda backup xatosi

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi |
| **Joy** | `backend/core/apps.py` → `ready()` backup/low-stock threadlar; `run_waitress.py` — avval `django.setup()`, keyin `migrate` |
| **Sabab** | `ready()` migratsiyadan **oldin** schedulerlarni start qiladi. Backup loop darhol `IntegrationSettings.get_solo()` chaqiradi — yangi ustun (`auto_low_stock_report_enabled` va boshqalar) hali yo‘q → `no such column`. |

### Yechim

1. Schedulerlarni migratsiya muvaffaqiyatli tugagach start qilish (`run_waitress` bootstrap oxirida).
2. Yoki `ready()` da faqat «arm» qilish; birinchi tick da `django.db.connection` + schema/migrate flag tekshiruvi.
3. Ustun yo‘q / `OperationalError` da warning + keyingi intervalda qayta urinish (hozir log bor, lekin ibtidoiy race qoladi).
4. QA: eski DB + yangi build birinchi start — migrate OK, backup xatosiz.

---

# 🟡 Mayda xatolar

## M1. Qarzni karta bilan to‘lashda bank shart emas

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi |
| **Joy** | `debt/services.py` → `record_debt_payment`; `DebtPaySerializer.card_bank` optional; sotuvda CARD uchun bank majburiy |
| **Yechim** | Sotuvdagi qoida bilan bir xil: `method=CARD` → `card_bank` valid enum bo‘lmasa 400. Frontend Debts modalda bank select majburiy (disabled confirm). |

---

## M2. Xom xato xabarlari UI da

| | |
|---|---|
| **Holat** | ✅ Tasdiqlandi (namuna yo‘llar) |
| **Joy** | DRF `ValidationError` / unique (`phone_normalized`); frontend `parseErrorResponse` ba’zan raw body ko‘rsatadi |
| **Yechim** | Backend: barqaror `code` + qisqa `detail` (masalan `CUSTOMER_PHONE_EXISTS`). Frontend: faqat `code` → i18n; raw `ErrorDetail` / dict ni foydalanuvchiga chiqarmaslik. |

---

## M3. Litsenziya / demo muddat (test DB)

| | |
|---|---|
| **Holat** | ℹ️ Kontekst — production bug emas |
| **Izoh** | Eski DB da demo tugagan → `LICENSE_EXPIRED` sotuvni bloklagan. Test uchun demo sana o‘zgartirilgan — to‘g‘ri. |
| **Yechim** | Test seed/fixture da aktiv demo yoki `LICENSE_ENFORCEMENT=False`. Production: aktivatsiya. Hujjatda test DB sini qo‘lda «tuzatish» ni odatiy yo‘l qilmaslik. |

---

# Tavsiya etilgan tuzatish tartibi

| Navbat | ID | Sabab |
|--------|-----|--------|
| 1 | J3, J2 | Tezkor, aniq NameError / FieldError |
| 2 | H1, H8 | Hisobot ishonchi + yangilanish barqarorligi |
| 3 | J4, J5, H5 | Pul yo‘qotish / suiiste’mol xavfi |
| 4 | J6, H4 | Smena hisoboti to‘g‘riligi |
| 5 | H2, H3 | Qarz + qaytarish yaxlitligi |
| 6 | J1, J7, H6, H7 | Ops / integratsiya / ma’lumot sifati |
| 7 | M1–M3 | Polish |

---

# Tekshiruv checklist (tuzatishdan keyin)

- [ ] Ikki Hansoft bir PC — port chalkashmasin  
- [ ] `catalog/low-stock/` va `by-brand/` → 200  
- [ ] Sotilgan chek narx tahriri → muvaffaqiyat  
- [ ] Kassir `pos-price` → 403; admin → OK  
- [ ] Kassir ixtiyoriy past narx → rad; admin tannarx ogohlantiruvi  
- [ ] Smenasiz sotuv → blok; yangi sotuvda `shift_id`  
- [ ] Nofaol TG kanal → Z yuborilmasin, kanal qayta active bo‘lmasin  
- [ ] Karta void → dashboard karta ≥ 0 va kutilgan qoldiq  
- [ ] Qarzli full return → `return_status: full`  
- [ ] Return reverse → qarz tiklansin  
- [ ] Xarajat → smena hisobotida > 0  
- [ ] Manfiy narx saqlanmasin  
- [ ] Eski SKU unitlari to‘g‘ri  
- [ ] Nakladnoy vaqti lokal  
- [ ] Yangilanish birinchi start — backup/migrate xatosiz  
- [ ] Qarz+karta → bank majburiy  
- [ ] UI xatolari i18n `code` orqali  

---

---

# Kritik tahlil — kodga tayyorlik (2026-10-10)

## Umumiy hukm

| Savol | Javob |
|--------|--------|
| Yechimlarni kodga qo‘llash mumkinmi? | **Ha, lekin bosqichma-bosqich.** Taxminan **~55%** bandlar bir zumda aniq (yopiq qaror); **~35%** uchun quyidagi qulflangan defaultlar kerak; **~10%** keyinga / ehtiyotkor data. |
| Reja puxtami? | **Asosiy tashxis puxta.** Ammo ba’zi bandlarda «A yoki B» ochiq qolgan, bir nechta yon-ta’sir hujjatda yo‘zilmagan edi (pastda). |
| Hamma narsani bir PR da qilish kerakmi? | **Yo‘q.** Tartib jadvali to‘g‘ri; J6/H3/H6 alohida ehtiyot. |

---

## Darhol kodlash mumkin (qaror ochiq emas)

| ID | Nima qilinadi | Xavf |
|----|----------------|------|
| **J2** | `Coalesce(..., Value(0, DecimalField))` + tip annotatsiyasi | Past |
| **J3** | `_q` import + tor `except` | Past — lekin pastga qarang: to‘lov sinxroni |
| **H2** | `int(Sum)` → `Decimal`, bonus qoidasi bir xil | Past |
| **H5** | serializer `min_value=0` + `complete_sale` manfiy rad | Past |
| **H7** (vaqt) | nakladnoy `timezone.localtime()` + chopda lokal format | Past |
| **J7** | `ensure_channels_from_legacy` da `is_active=True` qayta yoqishni olib tashlash | Past |
| **M1** | CARD → `card_bank` majburiy (sotuvdagi kabi) | Past |
| **H8** | migratsiya tugagach scheduler start (tavsiya #1) | O‘rta (startup tartibi) |

---

## Qulflangan qarorlar (kodlashdan oldin shu defaultlar)

Rejadagi «yoki» lar shu yerda **bir tanlov** qilib qulflanadi. O‘zgartirish kerak bo‘lsa — avval shu jadvalni yangilang.

| ID | Qulf | Nima uchun |
|----|------|------------|
| **J1** | Health da `"service": "hansoft-build-pos-api"` (yoki shu loyihaga xos yangi qiymat). Faqat `"geeks-pos-api"` yetarli **emas** — boshqa Hansoft ham shu nomni ishlatishi mumkin. | Aks holda port to‘qnashuvi qoladi. |
| **J4** | `PosVariantPriceView` → `IsAdminOrOwner`. Sozlama-flag **MVP da yo‘q**. Kassir chegirmasi faqat chek `unit_price` orqali (J5 qoidalari bilan). | Frontend hozir `updatePosVariantPrice` ni chaqirmaydi — API teshikni yopish yetarli. |
| **J5** | Kassir: `unit_price` ≥ tanlangan tarifa (`list_price` yoki `wholesale_price` qator tieriga qarab); undan past → 400. Admin/owner: `unit_price` < `purchase_price` → `BELOW_COST` + `confirm_below_cost: true` bo‘lmasa 400. Bonus: 0 ruxsat. | Ulgurji S2 ni buzmaslik: pastga tushirish emas, **tier narxiga teng/yuqori**. |
| **J6** | `Sale.shift` FK (`null=True`, string ref `expenses.Shift`). Yangi sotuvda OPEN smena majburiy (default on). Sozlama keyinga. X-hisobot **hozircha** vaqt oynasida qoladi; FK yoziladi, hisobotni FK ga o‘tkazish — **2-bosqich**. | Hisobotni birdan FK ga o‘tkazish scope ni portlatadi. |
| **H1** | Tavsiya **A+**: `today_*_total` = completed to‘lov − faqat **COMPLETED** sotuvlarga bog‘langan (void bo‘lmagan) refundlar; void refundlari alohida yoki umuman usul netdan chiqariladi. `today_cash_net_flow` da refundni ikki marta ayirmaslik. | X-hisobot mantiqiga yaqin; manfiy karta yo‘qoladi. |
| **H3** | Reverse return: shu return bilan bog‘liq `SaleRefund` larni reverse qilish + DEBT ni tiklash. Agar qaytarishdan keyin mijozga **yangi qarz to‘lovi** bo‘lsa — reverse ni rad etish yoki faqat admin + ogohlantirish (oddiy qoida: ochiq conflict bo‘lsa `refund_manual_required`). | Blind reverse buxgalteriyani buzadi. |
| **H4** | Ochiq smena bo‘lsa — avtomatik `related_shift`. Yo‘q bo‘lsa — **baribir saqlash** (`null`), lekin UI da ogohlantirish. Sotuv (J6) dan qattiqroq emas. | Admin smenasiz xarajat kiritishi mumkin. |
| **H6** | Avtomatik «hamma `kg` → `dona`» **qilmaslik**. Faqat: (a) management command + quruq-run ro‘yxat; (b) aniq do‘kon DB uchun qo‘lda tasdiq; (c) yangi o‘rnatishlarda default allaqachon `dona`. Qurilish do‘konida haqiqiy kg tovarlar bor. | Blind migratsiya omborni buzadi. |
| **H7** (bank) | MBANK/BAKAI ni almashtirish — **shu PR lar to‘plamidan tashqari** (mahsulot qarori). Faqat vaqt/nakladnoy tuzatiladi. | 00-qarorlarda UZ tillar bor, bank ro‘yxati alohida. |
| **M2** | Minimal: `CustomerSerializer` unique → `CUSTOMER_PHONE_EXISTS`; frontend `parseErrorResponse` da object/list raw chiqarmaslik. Barcha endpointlarni i18n qilish — keyin. | Scope nazorati. |
| **M3** | Kod o‘zgarishi yo‘q. | — |

---

## Rejada qolib ketgan / zaif joylar

### 1) J3 — narx tahriri to‘lovlarni yangilamaydi (yangi topilma)

`SaleLinePriceEditView` `grand_total` ni o‘zgartiradi, lekin `Payment` qatorlari o‘zgarmaydi → chek jami ≠ to‘lov yig‘indisi. `_q` importidan keyin endpoint «ishlaydi», lekin hisobot chalkashadi.

**Qo‘shimcha yechim (majburiy J3 bilan):** narx tahriridan keyin to‘lovlarni qayta taqsimlash yoki faqat farqni bir usulga yozish; yoki tahrirni faqat `payments` mos keladigan qoida bilan cheklash. Aks holda J3 ni «to‘liq tuzatilgan» deb hisoblamaslik.

### 2) J1 — service nomi

Rejada `geeks-pos-api` qolgan. Agar boshqa Hansoft ham shu stringni bersa — yana chalkashadi. Build POS uchun **alohida** service id kerak (qulf jadvalida).

### 3) J5 ↔ S2 (ulgurji)

«Kassir `list_price` dan pastga tushirmasin» deb yozilsa, ulgurji (`wholesale_price` < list) noto‘g‘ri bloklanadi. Qulf: **tier narxi** (chakana yoki ulgurji) ga nisbatan.

### 4) J6 — hisobot scope

Faqat FK qo‘shish ≠ smena hisoboti to‘g‘rilanadi. Hozir X-hisobot `completed_at` oralig‘ida. 1-bosqich: FK yoz + sotuv blok. 2-bosqich: X/Z ni `shift_id` bo‘yicha. Reja buni aralashtirib yuborgan edi.

### 5) H3 — qarz reverse murakkabligi

`apply_sale_refunds` DEBT da `total_amount` ni kamaytiradi. Keyin mijoz boshqa qarz to‘lagan bo‘lsa — oddiy «orqaga» xavfli. Conflict qoidasi bo‘lmasa regress chiqadi.

### 6) H6 — xavfli data migratsiya

Qurilish mollari uchun ko‘p tovar **haqiqatan kg**. Blind `UPDATE unit='dona'` — yangi xato. Command + qo‘lda tasdiq.

### 7) H1 — void refund belgisiz

`SaleRefund` da `is_void` yo‘q. Filtrlash: `sale.status == VOIDED` bo‘lgan sotuv refundlarini kunlik usul netdan chiqarish (yoki reason prefix). Yangi ustun ixtiyoriy.

### 8) Frontend bog‘liqliklar (reja kam yozgan)

| Band | Frontend |
|------|----------|
| J5 | `confirm_below_cost` dialog (admin); xato kodlari i18n |
| J6 | Smena yopiqda «To‘lov» disabled + aniq xabar (`App.tsx` auto-open bor, lekin yopilgandan keyin teshik) |
| H4 | Smenasiz xarajat ogohlantiruvi |
| M1 | Debts modalda bank majburiy |

### 9) Testlar

Mavjud `test_reports_and_integrations`, `test_sales_return_api`, `test_sale_history_return_meta` — H1/H2 o‘zgarganda yangilanishi shart. Rejada checklist bor, lekin «qaysi test fayl» yo‘q edi.

### 10) Circular dependency

`Sale.shift` → `expenses.Shift`: string FK (`"expenses.Shift"`) bilan OK. `sales` → `expenses` importini `complete_sale` ichida local qilish.

---

## Qayta ko‘rilgan tartib (kodlash)

| Bosqich | ID lar | PR tavsifi |
|---------|--------|------------|
| **P0a** 🔧 | J2, J3(+to‘lov sinxron), H2, H5 | Tezkor regressiyalar — **bajarildi** (`tests/test_p0a_finger_fixes.py`) |
| **P0b** 🔧 | H1, H8 | Hisobot + startup — **bajarildi** (`tests/test_p0b_dashboard_and_schedulers.py`) |
| **P0c** 🔧 | J4, J5(+FE), J7, M1 | Xavfsizlik / integratsiya — **bajarildi** (`tests/test_p0c_price_shift_integrations.py`) |
| **P1** 🔧 | J6(+FE), H4 | Smena bog‘lash — **bajarildi** (`tests/test_p1_shift_expense.py`, migratsiya `0012_sale_shift`) |
| **P1b** 🔧 | H3 | Return reverse + qarz — **bajarildi** (`tests/test_p1b_reverse_return_debt.py`, `0013_salerefund_reversed`) |
| **P2** 🔧 | J1, H7 vaqt, M2 | Ops/UX — **bajarildi**; H6/banklar keyin |

---

## Bosqich tahlili — P0b (H1, H8)

| Band | Natija | Izoh |
|------|--------|------|
| **H1** | ✅ | `_refund_sums_for_date(..., exclude_voided_sales=True)` — void refundlari `today_*_total` dan chiqarildi. `today_cash_net_flow` endi `today_cash_total - expenses` (refund ikki marta ayirilmaydi). |
| **H8** | ✅ | `HANSOFT_DEFER_SCHEDULERS=1` migrate oldidan; `start_background_schedulers()` migrate dan keyin (`run_waitress`). `ready()` defer bo‘lsa thread ochmaydi. |
| Testlar | ✅ 4/4 | 70k+30k void → card 40000; partial return net; cash_net_flow; scheduler idempotent. |
| Yon ta’sir | ⚠️ | `test_send_daily_z_report_uses_today_range` — eski mock (`_send_telegram_text`); P0b dan mustaqil, kanal routing. Keyinroq alohida. |
| Qoldiq | — | Z-hisobotda `cash_total` (net) + alohida «qaytarish» qatori vizual chalkashligi — mavjud dizayn, P0b da o‘zgartirilmadi. |

---

## Bosqich tahlili — P0c (J4, J5, J7, M1)

| Band | Natija | Izoh |
|------|--------|------|
| **J4** | ✅ | `PosVariantPriceView` → `IsAdminOrOwner`; kassir 403. |
| **J5** | ✅ | Kassir: `unit_price` ≥ `price_tier` floor (retail/wholesale). Admin: tannarxdan past → `BELOW_COST` + `confirm_below_cost`. FE: `price_tier` yuboriladi; admin `confirm()`. |
| **J7** | ✅ | `ensure_channels_from_legacy` nofaol kanalni qayta `is_active=True` qilmaydi. |
| **M1** | ✅ | Qarz CARD → `card_bank` majburiy (backend + Debts UI). |
| Testlar | ✅ 6/6 + build S2 | S2 wholesale endi `price_tier: wholesale` bilan. |
| Qoldiq | ⚠️ | Kassir tannarxni ko‘rmaydi — tier floor yetarli himoya; tannarx > list bo‘lgan noto‘g‘ri katalogda kassir hali ham «zarar»ga sota oladi (admin ma’lumoti). |

---

## Bosqich tahlili — P1 (J6, H4)

| Band | Natija | Izoh |
|------|--------|------|
| **J6** | ✅ | `Sale.shift` FK (`null` legacy). `complete_sale` OPEN smenasiz → `NO_OPEN_SHIFT`. Yangi sotuvlarga `shift_id` yoziladi. FE: to‘lov oldidan `checkShiftStatus`. |
| **H4** | ✅ | Xarajat create da ochiq smena → `related_shift` avtomatik. |
| Testlar | ✅ 3/3 | `no_auto_shift` markeri; conftest boshqa sale testlariga smena ochadi. |
| Qoldiq | ⚠️ | X-hisobot hali `completed_at` oynasida (FK ga o‘tkazish — 2-bosqich, rejada). Smena yopilgach login auto-open yo‘q — kassir Shift sahifasidan ochishi kerak. |

---

## Bosqich tahlili — P1b (H3)

| Band | Natija | Izoh |
|------|--------|------|
| **H3** | ✅ | `reverse_return_movement` endi `SaleRefund` soft-reverse (`reversed_at`) + DEBT `total/remaining` tiklaydi. Keyingi qarz to‘lovi bo‘lsa — reverse rad. |
| Hisobot | ✅ | `_refund_sums*` / X-hisobot / history meta — faqat `reversed_at IS NULL`. |
| Test | ✅ | Qarzli full return → reverse → qarz 73000 OPEN, ombor sotuvdan keyingi holat. |
| Qoldiq | ⚠️ | Ko‘p qatorli bitta qaytarishni qisman reverse qilish LIFO refund match; murakkab splitda qo‘lda tekshirish kerak. |

---

## Bosqich tahlili — P2 (J1, H7 vaqt, M2)

| Band | Natija | Izoh |
|------|--------|------|
| **J1** | ✅ | Health `service: hansoft-build-pos-api`; Tauri `health_ok_at` + `run_waitress._health_ok` shu id ni talab qiladi. |
| **H7** | ✅ | Nakladnoy `timezone.localtime()` + `YYYY-MM-DD HH:MM` (offset kesilmaydi). Bank ro‘yxati — o‘zgarmagan (mahsulot qarori). |
| **M2** | ✅ | Duplicate phone → `CUSTOMER_PHONE_EXISTS`; FE `parseErrorResponse` raw ErrorDetail ni yutib yubormaydi. |
| **H6** | ⏳ | Blind `kg→dona` qilinmadi (qulf). Kerak bo‘lsa alohida management command. |
| Qoldiq | — | Sidecar/Tauri rebuild kerak — `main.rs` o‘zgarishi native binaryda. |
| **P0c** | J4, J5(+FE), J7, M1 | Xavfsizlik / integratsiya |
| **P1** | J6(+FE blok), H4 | Smena bog‘lash (hisobot FK — keyin) |
| **P1b** | H3 | Return reverse + qarz |
| **P2** | J1, H7 vaqt, M2 | Ops / UX |
| **P2b** | H6 command | Data; do‘kon bo‘yicha |
| **Keyin** | H7 banklar, J6 hisobot FK, M3 | Mahsulot / ops |

---

## Kodlashni boshlash sharti

Quyidagilar tasdiqlansa — kodga o‘tish **xavfsiz**:

1. Yuqoridagi **qulflangan qarorlar** jadvali qabul qilindi.  
2. J3 ga to‘lov sinxroni qo‘shiladi (yoki narx tahriri vaqtincha o‘chiriladi).  
3. H6 blind migratsiya qilinmaydi.  
4. J6 1-bosqichda faqat FK + blok; X-hisobot FK ga o‘tkazilmaydi.

**Bog‘liq:** [09-finger-test-topilmalar.md](./09-finger-test-topilmalar.md) (UI/UX) · [10-pos-ui-yechimlar.md](./10-pos-ui-yechimlar.md) (POS layout) · [00-qabul-qilingan-qarorlar.md](./00-qabul-qilingan-qarorlar.md) (S2 ulgurji)
