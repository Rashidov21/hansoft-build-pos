# POS UI: savdo vaqtida buzilish — yechimlar

**Sana:** 2026-10-07  
**Manba:** finger-test (`09`) + savdo screenshot (RU: «Кол-во» ustuni, to‘lov paneli)  
**Fayl:** `frontend/src/pages/PosPage.tsx`, `frontend/src/index.css`

---

## Muammo (nima ko‘rinadi)

Savdo paytida (savatda ≥1 qator) layout «buziladi»:

1. **Miqdor (±)** — `-` / `1 m` / `+` vertikal o‘raladi; qator balandligi 2–3× ortadi.  
2. **Savat qatori** — Chakana / Ulgurji / Bonus / Qoldiq chip’lari + kirim narxi ustuni tor ekranda siqiladi.  
3. **To‘lov paneli** — sticky dock bilan ham o‘ng panel scroll bo‘lishi mumkin; «Tezkor to‘lov» pastga ketadi.  
4. **«Yangi qator»** yorlig‘i Chakana/Ulgurji yonida chalkash joylashgan.

Asosiy sabab: `table-fixed` + tor ustunlar + `flex-wrap` + `min-w/min-h-kiosk-touch` (≈48px) — uchta tugma bir qatorga sig‘maydi.

---

## Yechimlar (bajarish tartibi)

### Y1 — Miqdor stepperni hech qachon wrap qilmaslik · **P0**

**Muammo:** `inline-flex flex-wrap` + 2× `min-w-kiosk-touch` + `min-w-[3.25rem]` → ~160px kerak, `w-[22%]` ustun yetarli emas.

**Yechim:**

| O‘zgarish | Tafsilot |
|-----------|----------|
| `flex-wrap` → `flex-nowrap` | Qty guruhida wrap yo‘q |
| Ustun kengligi | Qty `w-[22%]` → `w-[9.5rem]` yoki `minmax(9.5rem, 26%)`; kerak bo‘lsa Tovar `w-[42%]` → `w-[38%]` |
| Birlik matni | `1` + `m` bitta qatorda (`inline`), `block` emas — tugma balandligi oshmasin |
| Tor ekran | Agar joy yetmasa: faqat markaziy miqdor tugmasi (numpad); ± `pos-lg:` dan ko‘rinsin **yoki** ± `min-w-10` (40px), touch qoidalari saqlanadi |

**Qabul:** 1024×768 va 1366×768 da `- 1 m +` doim **bitta gorizontal qator**.

**Kod nuqtasi:** `PosPage.tsx` ~1700–1736 (`lastQtyCellRef` bloki).

---

### Y2 — Savat qatorini ikki qavatga ajratish · **P0**

**Muammo:** Birinchi `<td>` ichida nom + narx + 4 ta amal chip’i — qator «devor» bo‘lib o‘sadi; miqdor/summa vertikal markazda yo‘qoladi.

**Yechim (tavsiya):**

```
Qator 1 (asosiy):  [Nom + birlik·narx]  |  [Kirim?]  |  [− qty +]  |  [Summa ✎]
Qator 2 (ixtiyoriy amallar):  [Chakana|Ulgurji] [Bonus] [Qoldiq]   colspan=…
```

Yoki amallarni **⋯ / «Amallar»** menyusiga yig‘ish (qurilish UX: kam matn — `05-ux`).

**Minimal variant:** chip’larni `text-[11px] min-h-8 px-2` qilib qator 1 ostida bitta `flex-nowrap overflow-x-auto` qator.

**Qabul:** 5–8 qatorli savatda asosiy jadval scroll qilinadi; har qator balandligi barqaror (~64–88px asosiy + amallar).

---

### Y3 — Jadval ustunlari va kirim narxi · **P1**

**Muammo:** `showPurchasePrice` yoqilganda 4 ustun; qty yanada siqiladi (screenshot).

**Yechim:**

1. Kassir rolida kirim narxi **default off** (allaqachon sozlama bo‘lsa — default `false` tekshirish).  
2. Yoqilganda: kirim ustuni `w-[7rem]`, truncate/`text-xs`; qty minimal kengligi **ustuvor**.  
3. `table-layout: fixed` + aniq `colgroup`/`w-*` — foizlar o‘rniga `rem` asosida.

---

### Y4 — To‘lov paneli: scroll faqat yuqori zona · **P1**

**Muammo:** Naqd «Berilgan» chip’lari + bank tanlash + nasiya maydonlari sticky dockni pastga suradi; viewportda scroll paydo bo‘ladi.

**Yechim (hozirgi tuzilma saqlanadi, qattiqlashtiriladi):**

| Zona | Qoida |
|------|--------|
| Yuqori (`flex-1 overflow-y-auto`) | Split to‘lov qatorlari, bank, nasiya, naqd chip’lar |
| Pastki sticky dock (`shrink-0`) | Chegirma, jami, F1–F3, qabul/qaytim, Nakladnoy / Bekor / Tezkor |

Qo‘shimcha:

- Naqd nominal chip’lari: `overflow-x-auto flex-nowrap` (wrap bilan balandlik oshmasin).  
- F1–F3 + Tezkor **har doim** birinchi ekranda (scrollsiz) — `max-height` hisobi: `100dvh − header − queue-strip`.  
- `main` allaqachon `overflow-hidden` — aside `h-full min-h-0` saqlansin; butun sahifa scrolliga yo‘l qo‘ymaslik.

**Qabul:** 768px balandlikda bo‘sh savat + 1 to‘lov qatori → Tezkor tugmasi scrollsiz ko‘rinadi.

---

### Y5 — Yuqori strip: «Yangi qator» chalkashligi · **P2**

**Muammo:** Global Chakana/Ulgurji yonidagi «Yangi qator» / «НОВАЯ СТРОКА» yorlig‘i joy va e’tiborni oladi.

**Yechim:**

- Yorliqni olib tashlash **yoki** `title` / `aria-label` ga ko‘chirish.  
- Strip: `[Faol navbatlar] …… [Chakana|Ulgurji] [Navbatga olish]` — bitta qator, `items-center`.  
- Navbatlar 0 bo‘lsa strip balandligini kamaytirish (`py-1`).

---

### Y6 — Ko‘p qatorli savdo stress-test · **P1**

**Yechim (QA, kod emas):**

| Ssenariy | Kutilgan |
|----------|----------|
| 1 qator, `m` birlik | ± bir qator |
| 12 qator | chap panel scroll; o‘ng dock sticky |
| Kirim narxi ON | qty wrap yo‘q |
| Naqd + 5 nominal chip | chip’lar gorizontal scroll |
| Karta + bank tanlash | Tezkor hali sticky pastida |
| Viewport 1024×768, 1366×768, 1920×1080 | bir xil qoidalar |

---

## Amaliy patch rejasi

1. ✅ **Y1** — `flex-nowrap` + qty `w-[9.75rem]` + birlik inline (`PosPage.tsx`).  
2. ✅ **Y2** — asosiy qator + amallar qatori (`Fragment`, ixcham chip’lar, gorizontal scroll).  
3. ✅ **Y4** — naqd chip `flex-nowrap overflow-x-auto`.  
4. ✅ **Y3** — kirim ustuni `w-[7rem]` / `text-xs` (faqat ADMIN/OWNER).  
5. ✅ **Y5** — «Yangi qator» faqat `title`/`aria-label`; strip bitta qator.  
6. ⬜ **Y6** — qo‘lda regressiya (1024 / 1366).

---

## Nima qilmaslik

- Butun savatni `overflow-x-auto` bilan «yashirish» — ± hali wrap bo‘ladi, faqat gorizontal scroll qo‘shiladi.  
- Touch min-o‘lchamni 48px dan ancha kichik qilish (kiosk UX buziladi) — yaxshiroq ustun kengligi yoki ± ni yashirish.  
- To‘lov dockini scroll ichiga qaytarish — tezkor sotuv sekinlashadi.

---

## Bog‘liq topilmalar

| ID (`09`) | Holat | Bu hujjat |
|-----------|--------|-----------|
| P2 | qisman (`table-fixed`) | **Y1–Y2** to‘liq yopadi |
| P4 | chalkashlik | **Y2/Y5** — global vs qator |
| P5 | kirim narxi | **Y3** |
| P8 | navbat strip | **Y5** |
