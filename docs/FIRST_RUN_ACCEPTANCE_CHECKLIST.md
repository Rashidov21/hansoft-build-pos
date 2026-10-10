# Geeks POS First-Run Acceptance Checklist

This checklist is for a clean Windows POS machine (no prior install).

## Build & Package

1. Build backend sidecar:
   - `powershell -ExecutionPolicy Bypass -File .\backend\scripts\build_sidecar.ps1`
2. Build frontend:
   - `npm run build --prefix frontend`
3. Build desktop bundle:
   - `npm run tauri:build`

## First Launch Expectations

1. App starts without opening terminal windows.
2. `%APPDATA%\GeeksPOS\db.sqlite3` is created.
3. Backend migrations are applied automatically.
4. Default users are created automatically:
   - `admin / pass12345`
   - `cashier / pass12345`
5. Default PIN for both users is `1111` (only on fresh setup).

## Runtime & Recovery

1. App starts on Windows logon.
2. Fullscreen kiosk window is active (no decorations, always-on-top).
3. Reboot machine -> app auto starts and login page is ready.
4. If backend fails, logs are available:
   - `%APPDATA%\GeeksPOS\logs\app.log`
   - `%APPDATA%\GeeksPOS\logs\backend.log`

## Functional Smoke Test

1. Login with cashier PIN `1111`.
2. Add product by barcode and complete sale.
3. Receipt prints on receipt printer (if `receipt_printing_enabled`).
4. Label printing works on label printer (admin path — see below).
5. `Smena (X)` page loads.
6. Warehouse / inventory page loads.

## Printer & label acceptance (Admin / Owner)

Hardware reference: [`HARDWARE_CONFIG.md`](../HARDWARE_CONFIG.md). Ops notes: [`MONOBLOCK_OPS.md`](MONOBLOCK_OPS.md).

### A. Settings — receipt (XP-80C)

1. Login as **admin** (PIN `1111`).
2. **Sozlamalar** → enable **Chek chop etish**.
3. Hardware wizard **step 1**: select Windows queue for XP-80C (or type name); optional port hint `USB001`.
4. Paper width **80 mm** (or 58 mm if that roll is installed).
5. Click **Chek printerini test qilish** → physical test receipt.
6. Set brand / phone / address / footer → **Saqlash** → another test or sale receipt shows the texts.
7. Next → step 2 (label).

### B. Settings — label (XP-365B)

1. Enable **Stiker chop etish** (if off).
2. Wizard **step 2**: select XP-365B queue; port hint `USB002` if needed; type **TSPL**.
3. Default size **40×30 mm** (recommended).
4. Toggle **narxni ko‘rsatish** as needed → **Test stiker** → physical demo label (`Demo tovar` / TEST123456).
5. Next → scanner step → save settings.

### C. Catalog reprint

1. Open **Katalog** (admin/owner only).
2. Pick a product **with barcode** → Amallar (⋮) → **Etiketka chop etish**.
3. Confirm prefill size = store default (`40x30`); print **1** copy.
4. Print again with **5** copies and optionally size `40x50`.
5. Product **without** barcode → Print disabled / clear error.
6. Disable **Stiker chop etish** in Settings → Katalog action hidden.

### D. Negative / recovery

1. Wrong printer name → toast indicates missing / queue failure (not silent success).
2. Spooler stopped → Windows error; restart Print Spooler, retry.
3. Receipt disabled → POS does not auto-print after sale.

## Related ops guides

- [MONOBLOCK_OPS.md](MONOBLOCK_OPS.md) — Defender, USB/printer, SQLite, double-complete smoke test.
- [qurilish-mollari/12-printer-etiketka.md](qurilish-mollari/12-printer-etiketka.md) — print contract (UZ).
- [TAURI_UPDATER_SETUP.md](TAURI_UPDATER_SETUP.md) — avtomatik yangilanishni yoqish shabloni.
- [SYNC_PUSH_ROADMAP.md](SYNC_PUSH_ROADMAP.md) — bulutga sotuv push yo‘l xaritasi.
