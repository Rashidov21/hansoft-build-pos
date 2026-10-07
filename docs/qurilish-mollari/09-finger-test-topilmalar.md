# Finger-test topilmalari (UI / UX)

**Sana:** 2026-10-07  
**Muhit:** `http://127.0.0.1:5173` + backend `:8000`, dark theme, UZ, admin sessiyasi (PIN API orqali), viewport ~784×690  
**Seed:** `clear_and_seed_build.py` (15 ta qurilish mollari)  
**Qamrov:** Login (kod + oldingi sessiyadagi UI tekshiruv), barcha admin sahifalar, POS (savat + ulgurji + to‘lov zonasi), sozlamalar tablar

Jiddiylik: **P0** bloklovchi / chalkashlik yuqori · **P1** layout/visual buzilish · **P2** noaniqlik / polish

---

## 1. Global (barcha admin sahifalar)

| # | Jiddiylik | Topilma | Joy |
|---|-----------|---------|-----|
| G1 | **P0** | Yig‘ilgan sidebar: faqat ikonlar. Tooltip/label ko‘rinmaydi — yangi kassir uchun yo‘nalish noaniq. | Admin shell |
| G2 | **P0** | Sidebar yoyilganda (`Menyuni ochish`) **Sozlamalar** pastga chiqib ketadi: `overflow-y: hidden`, scroll yo‘q. ~690px balandlikda Sozlamalar viewport tashqarisida; **Chiqish** pastga yopishib qoladi. | Sidebar |
| G3 | **P1** | **Chiqish** ikki marta: sidebar pastida + headerda (POS/sozlamalarda). Takroriy chiqish nuqtalari chalkashtiradi. | Header + sidebar |
| G4 | **P2** | Til + tema bitta tugmada: `UZ · Qorongʻu`. Faqat til yoki faqat temani almashtirish intuitiv emas. | Header |
| G5 | **P2** | Tor viewport (~784px): katalog jadvali, qarzlar jadvali, POS savat qatori gorizontal scroll / truncate. | Umumiy |

---

## 2. Login

| # | Jiddiylik | Topilma |
|---|-----------|---------|
| L1 | **P1** | «Foydalanuvchini tanlang» matni 3 marta takrorlanadi: chap panel sarlavhasi, chap paneldagi label, o‘ng formadagi label. |
| L2 | **P1** | Foydalanuvchi kartochkasida username + `display_name`/`role` — ba’zi hollarda bir xil ma’lumot ikki qatorda (dublikat). |
| L3 | **P1** | **Kirish** tugmasi PIN bo‘sh bo‘lsa ham faol (`disabled` faqat `!u` bo‘yicha). Bo‘sh PIN bilan bosish — xato, lekin tugma «tayyor» ko‘rinadi. |
| L4 | **P2** | Brauzerda dasturiy numpad clicklari bilan PIN to‘plash flaky (React state race); real sensor/touchda alohida tekshirish kerak. |

---

## 3. POS (`/admin/pos`)

| # | Jiddiylik | Topilma |
|---|-----------|---------|
| P1 | **P0** | `kg` / `m` birliklarda default miqdor **0.1** (`defaultSaleQty`). Armatura qo‘shilganda savatda `0.100 m` → jami 1 300 so‘m. Qurilish do‘konida kutilgan default odatda **1**. |
| P2 | **P0** | Savat qatorida gorizontal scroll (tor ekranda): miqdor ±, narx, Chakana/Ulgurji/Bonus/Qoldiq bir qatorda siqiladi — layout buziladi. |
| P3 | **P1** | **F1 / F2 / F3** tugmalari faqat harf ko‘rsatadi; `title` da Naqd/Karta/Nasiya bor, lekin ekranda yozuv yo‘q — yangi foydalanuvchi uchun tushunarsiz. |
| P4 | **P1** | Chakana/Ulgurji **ikki joyda**: yuqori global toggle + har qator. Global va qator sinxroni tushunarsiz (qator Ulgurji → narx 11 500, lekin global hali Chakana bo‘lishi mumkin). |
| P5 | **P1** | Har qatorda **Kirimi narxi** (sariq) doim ko‘rinadi. Kassir/mijoz oldida tannarx ochiq — biznes siyosatiga zid bo‘lishi mumkin. |
| P6 | **P1** | Legacy brend `Category` matni savatda ko‘rinadi: `Category Armatura 12 mm` (seed `Category.objects.create(name_uz="Category")`). |
| P7 | **P2** | «Oxirgi qator soni» — nima qilishi birinchi qarashda noaniq (focus shortcut). |
| P8 | **P2** | «Navbatga olish» / «Faol navbatlar» — oddiy tezkor sotuv oqimida ikkilamchi; bo‘sh savatda ham ko‘zga tashlanadi. |
| P9 | **P2** | Qidiruv debounce ~320 ms: tez yozganda bir lahzaga «Hech narsa topilmadi» chaqnashi mumkin. |
| P10 | **OK** | Ulgurji narx ishlaydi (0.1 m × 11 500 = 1 150). Bo‘sh savatda Tezkor/Nakladnoy/Bekor disabled. |

---

## 4. Katalog

| # | Jiddiylik | Topilma |
|---|-----------|---------|
| C1 | **P1** | Tor ekranda nom/kategoriya truncate: `Armatura 12...`, `Metall va p...`, `Devor mat...` — identifikatsiya qiyin. |
| C2 | **P2** | «Tovar qo‘shish» formasi qurilish birliklari (dona/kg/m/qop) va ulgurji narx bilan yaxshi; lekin orqa fonda jadval hali scroll/klik qilinadi (modal fokusi zaif). |
| C3 | **OK** | Amallar menyusi (Tahrirlash / Qoldiqni tezkor tuzatish / Noaktiv / O‘chirish) ochiladi. |

---

## 5. Inventar / Ombor / Ta’minotchi

| # | Jiddiylik | Topilma |
|---|-----------|---------|
| I1 | **P0** | Sidebar **«Inventarizatsiya»** → sahifa sarlavhasi **«Qoldiq va kirim boshqaruvi»** (kirim + tuzatish + inventar). Nomlar mos emas — kassir «inventar» deb kirib, «kirim» ko‘radi. |
| I2 | **P1** | Uchta rejim kartochkasi: tanlangan holat vizual jihatdan zaif (screenshotda aniq «active» ajralmaydi). |
| I3 | **P1** | Mahsulot ro‘yxatida hamma qatorlarda `Category —` (inglizcha legacy brend + bo‘sh barcode). |
| I4 | **P1** | «Saqlangandan keyin qoldiq: 501» — birlik (`m`) ko‘rsatilmaydi; yuqorida «500 m» bor. |
| I5 | **P2** | Rejim tugmalari a11y nomida butun izoh matni birikkan (uzun `name`). |
| I6 | **P2** | Ombor (ko‘rish) / Inventarizatsiya / Sozlamalar→«Inventarizatsiya ustasi» — uch xil «ombor» nuqtasi; qayerdan nima qilish chalkash. |
| I7 | **OK** | Yetkazib beruvchilar: bo‘sh holat + «Ta’minotchi qo‘shish» aniq CTA. |

---

## 6. Smena (X)

| # | Jiddiylik | Topilma |
|---|-----------|---------|
| S1 | **P0** | `has_open_shift: false` bo‘lganda UI **«Yuklanmoqda...»** ko‘rsatadi (else branch loading). API 200 qaytaradi — smena yopiq ekanligi hech qachon ko‘rinmaydi. Kod: `ShiftXReportPage.tsx` — ochiq emas → loading. |
| S2 | **P1** | «Hisobotni yangilash» gridning faqat birinchi ustuni ostida — ikkinchi sana maydoni bilan vizual muvozanat yo‘q. |
| S3 | **P2** | X-hisobot va Z-hisobot bir sahifada; yangi foydalanuvchi farqini o‘qishi shart (matn bor, lekin vizual ajratish zaif). |

---

## 7. Sozlamalar

| # | Jiddiylik | Topilma |
|---|-----------|---------|
| Z1 | **P1** | Har tabda yuqorida bir xil sarlavha/izoh: «Do‘kon sozlamalari» + chek header matni — Foydalanuvchilar/Xavfsizlik uchun mos emas. |
| Z2 | **P1** | Tab tanlangach, yana bitta katta «Do‘kon» / «Foydalanuvchilar» sub-chip — tab dublikati, joy yo‘qotadi. |
| Z3 | **P1** | Botlar tabida inglizcha UI: `Both`, `GreenAPI`, `Custom API`, `WhatsApp API base URL`, placeholderlar. |
| Z4 | **P1** | Do‘kon tabida chek tili selectida **Qirgʻizcha (ky)** bor — mahsulot tillari uz / uz-cyrl / ru. Mos kelmaslik. |
| Z5 | **P1** | Xavfsizlik: «Demo muddat: 0 kun qoldi», Hardware ID «Mavjud emas» — ogohlantiruvchi/ chalkashtiruvchi holat. |
| Z6 | **P2** | Xavfsizlik ichida «Inventarizatsiya ustasi» — kutilmagan joy (litsenziya/PIN yonida). |
| Z7 | **P2** | Kontakt `Telegram: @rashidov_21` ikki marta takrorlanadi. |
| Z8 | **P2** | Uzbek UI ichida «Activation key» inglizcha qoldiq. |

---

## 8. Qarzlar / Qaytarish / Sotuvlar / Chiqimlar / Dashboard

| # | Jiddiylik | Topilma |
|---|-----------|---------|
| D1 | **P1** | Qaytarish qidiruv hintida hali **«model»** (telefon POS merosi): «chek raqami, barcode, model». |
| D2 | **P1** | Qarzlar jadvali tor ekranda gorizontal scroll (`overflow-x-auto`). |
| D3 | **P2** | Sotuvlar: bo‘sh holat yaxshi; «Tozalash» nomi agressiv — filtr tozalashmi yoki arxivmi, birinchi qarashda noaniq. |
| D4 | **P2** | Chiqimlar: Summa default `0`, Saqlash ko‘rinadi — 0 so‘m saqlash xavfi (validatsiya alohida tekshirilmadi). |
| D5 | **P2** | Dashboard: ko‘p KPI + «Bugungi hisobot» / «Davr» — yangi egasi uchun og‘ir; layout o‘zi buzilmagan. |
| D6 | **OK** | Honey/asal matnlari asosiy sahifalarda topilmadi. |

---

## 9. User-flow chalkashliklari (xulosa)

1. **Ombor oqimi parchalanган:** Ombor (ko‘rish) ≠ Inventarizatsiya (aslida kirim/tuzatish) ≠ Sozlamalar→Inventarizatsiya ustasi. Bitta «ombor» mental model yo‘q.  
2. **POS miqdor:** `m`/`kg` uchun 0.1 default — tezkor sotuvda xato summa xavfi.  
3. **Smena holati yolg‘on loading:** yopiq smena «yuklanmoqda» — kassir smena ochish/yopishni qayerdaligini bilmaydi.  
4. **Sidebar Sozlamalar yashirin:** past ekranda sozlamaga yetib bo‘lmaydi (scroll yo‘q).  
5. **Chakana/Ulgurji ikki daraja** + F1–F3 yorliqsiz — to‘qlov usuli chalkash.  
6. **Login:** takroriy «tanlang» + bo‘sh PIN bilan Kirish.  
7. **Legacy «Category» / «model»** matnlari qurilish kontekstiga mos emas.

---

## 10. Tekshirilgan sahifalar (checklist)

- [x] Login (UI tahlil + oldingi finger-sessiya)
- [x] `/admin/dashboard`
- [x] `/admin/pos` (qidiruv, savat, ulgurji, to‘lov zonasi)
- [x] `/admin/catalog` (+ Tovar qo‘shish, Amal menyusi)
- [x] `/admin/inventory` (kirim, mahsulot tanlash)
- [x] `/admin/stock`
- [x] `/admin/suppliers`
- [x] `/admin/debts`
- [x] `/admin/returns` (process)
- [x] `/admin/sales`
- [x] `/admin/shift`
- [x] `/admin/expenses`
- [x] `/admin/settings` (Do‘kon / Botlar / Foydalanuvchilar / Xavfsizlik)

**Cheklovlar:** printer/nakladnoy real chop, nasiya to‘liq modal, ta’minotchi CRUD saqlash, chiqim saqlash, qaytarish to‘liq wizard — chuqur happy-path emas (bo‘sh ma’lumot / printer yo‘q). Brauzer viewport kiosk 1024×768 dan kichikroq — ba’zi truncate/scroll shu sababli kuchaygan.

---

## 11. Optimal tuzatish tartibi (bajarildi — 2026-10-07)

1. ✅ **S1** — `shiftStatusLoaded`: yopiq smena «Yuklanmoqda» emas, «Smena yopiq».  
2. ✅ **P1** — `defaultSaleQty` → `1` (step 0.1 saqlanadi).  
3. ✅ **L3** — Kirish PIN 4 xonadan kam bo‘lsa disabled.  
4. ✅ **G2** — Sozlamalar sidebar footer da; admin menyuda Ombor birlashtirildi (stock alohida yo‘q).  
5. ✅ **I1+I6** — `WarehousePage`: Qoldiq | Kirim/tuzatish tablar.  
6. ✅ **P3** — F1/F2/F3 doim yorliq bilan (Naqd/Karta/Nasiya).  
7. ✅ **P2/P4** — savat `table-fixed` + qty wrap; global Chakana/Ulgurji «Yangi qator» yorlig‘i.  
8. ✅ Seed/locale — `Asosiy` brand; POS da `Category` yashirinadi; qaytarish hintidan «model» olib tashlandi.
