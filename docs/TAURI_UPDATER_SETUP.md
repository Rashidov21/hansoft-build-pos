# Tauri updater (keyingi relizlar uchun shablon)

Hozir [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) ichida `"updater": { "active": false }`. Avtomatik yangilanishni yoqish uchun quyidagilar kerak bo‘ladi.

## 1. Kod tomoni

- `tauri.conf.json` → `updater.active: true`
- `endpoints` — JSON manifest URL (HTTPS)
- `pubkey` — yangilanish paketlarini tekshirish uchun public key (Tauri updater hujjatiga qarang)

## 2. Infratuzilma

- **HTTPS** hosting: `latest.json` + `.sig` yoki platforma bo‘yicha paketlar
- **Kod imzolash**: Windows uchun `.msi`/`.exe` yoki `nsis` bundle imzolash siyosati
- **Versiya**: `package.version` va reliz tag bir xil bo‘lishi

## 3. Windows Defender / SmartScreen

- Imzosiz yoki noyob publisher `.exe` uchun foydalanuvchi “Run anyway” yoki IT allowlist kerak bo‘lishi mumkin
- Tijorat uchun: **kod imzolangan** installer tavsiya etiladi

## 4. Tekshiruv

1. Eski versiyani o‘rnating
2. Serverda yangi `latest.json` ni joylashtiring
3. Ilovani oching → updater dialog / fon yangilanishi (siz sozlagan UX bo‘yicha)

Bu fayl faqat yo‘l-yo‘riq; aniq `pubkey` va `endpoints` qiymatlari sizning reliz serveringizga bog‘liq.
