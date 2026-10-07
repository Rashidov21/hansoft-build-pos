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
3. Receipt prints on receipt printer.
4. Label printing works on label printer.
5. `Smena (X)` page loads.
6. `Ombor (ko'rish)` page loads.

## Related ops guides

- [MONOBLOCK_OPS.md](MONOBLOCK_OPS.md) — Defender, USB/printer, SQLite, double-complete smoke test.
- [TAURI_UPDATER_SETUP.md](TAURI_UPDATER_SETUP.md) — avtomatik yangilanishni yoqish shabloni.
- [SYNC_PUSH_ROADMAP.md](SYNC_PUSH_ROADMAP.md) — bulutga sotuv push yo‘l xaritasi.
