# POS monoblok — operatsion checklist (Windows / hardware)

Bu hujjat dastur **tashqi** muhit muammolarini kamaytirish uchun qisqa ro‘yxat. Ilova logikasi uchun [`FIRST_RUN_ACCEPTANCE_CHECKLIST.md`](FIRST_RUN_ACCEPTANCE_CHECKLIST.md) bilan birga qo‘llang. **Release yig‘ish / o‘rnatishdan keyin:** [`PRODUCTION_POST_INSTALL.md`](PRODUCTION_POST_INSTALL.md).

## Windows Defender va SmartScreen

- Agar `.exe` yoki sidecar `geeks_pos_backend.exe` bloklansa: **Virus & threat protection** → **Manage settings** → **Exclusions** ga o‘rnatish papkalarini qo‘shing (masalan `C:\Program Files\GEEKS POS\` yoki `%LocalAppData%\GEEKS POS\`).
- Korporativ POS uchun IT tomonidan **allowlist** tavsiya etiladi.

## USB / shtrix-skanner (keyboard wedge)

- USB port almashganda skaner odatda qayta ishlaydi; **COM-serial** rejimi loyihada alohida reconnect logikasi talab qiladi (hozircha asosan keyboard rejimi).
- Skaner “prefix/suffix” sozlamalari: **Settings** → skaner qoidasi (Enter o‘rniga Tab va hokazo).

## Printer

- Windows **Print Spooler** xizmati ishlamoqda bo‘lishi kerak.
- Test sahifa chiqadi-yu dasturda chiqmasa: dasturdagi printer nomi va **RAW/ESC-POS** mosligi, shuningdek `printingHub` xabarlarini tekshiring.

## SQLite / ma’lumotlar

- To‘g‘ridan-to‘g‘ri tok o‘chirish **bazani buzishi** mumkin; UPS tavsiya etiladi.
- Muntazam **backup**: admin orqali `backup-now` API / UI.
- Agar `database is locked` takrorlansa: bitta `geeks_pos_backend` jarayoni ishlayotganini tekshiring; kerak bo‘lsa ilovani yopib qayta oching.
- Production build siyosati: `backend/db.sqlite3` buildga kirmasligi kerak (release skript buni endi fail qiladi).
- Productionda default DB override o‘chirilgan; test uchun kerak bo‘lsa faqat dev rejimida `GEEKS_POS_ALLOW_DB_OVERRIDE=1` bilan `GEEKS_POS_DB_PATH` ishlating.

## Dastur: ikki marta “Yakunlash” smoke testi (regressiya)

1. Savatga 1–2 qator qo‘shing, to‘lovni jami bilan moslang.
2. **Yakunlash** tugmasini imkon qadar tez ikki marta bosing yoki Enter ni ketma-ket yuboring.
3. **Kutilgan natija**: bitta savdo (`Sales history`da bitta yozuv yoki bir xil `sale_id`); ikki marta to‘liq ikki savdo **bo‘lmasligi** kerak (idempotency fingerprint + sinxron qulf).

Tekshiruv mantiqisi kodi: [`frontend/src/utils/saleFingerprint.ts`](../frontend/src/utils/saleFingerprint.ts), [`frontend/src/pages/PosPage.tsx`](../frontend/src/pages/PosPage.tsx) (`completeInFlightRef`, `idempotencyGenRef`).

## Shtrix-kod duplicate (tez ikki skan)

- Bir xil kod **200 ms** ichida takrorlansa ikkinchi qo‘llama e’tiborsiz qoldiriladi (keyboard wedge duplicate). Zarurat bo‘lsa interval keyinroq sozlanishi mumkin (`SCAN_DEBOUNCE_MS`).
