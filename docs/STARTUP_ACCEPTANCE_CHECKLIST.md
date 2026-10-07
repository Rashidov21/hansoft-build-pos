# Geeks POS — Startup acceptance checklist

Startup stability rejasi bo‘yicha qabul qilish va regressiya tekshiruvlari.

## 1. Backend / sidecar

- [ ] Loyiha ildizida: `python backend/run_waitress.py --self-check` → chiqish kodi `0`, konsolda `SELF_CHECK_OK`.
- [ ] `BOOTSTRAP_START` / `Migrations OK` / `BOOTSTRAP_DONE` ketma-ketligi; **`AppRegistryNotReady` yo‘q**.
- [ ] `backend\scripts\build_sidecar.ps1 -RequireVenv` muvaffaqiyatli tugaydi va `--self-check` yiqilmasin.
- [ ] `build_and_deploy.ps1` oxirida `src-tauri\target\release\geeks_pos_backend*.exe` mavjud.

## 2. Tauri + backend integratsiyasi

- [ ] Soqovchi ishga tushishi: birinchi ochilishda backend health `200` va `"status":"ok"`.
- [ ] `GeeksPOS/logs/backend_boot.log`da migratsiya xatosi bo‘lmasa.
- [ ] Backend erta `exit code: 1` bilan yopilmasin (oddiy first-run).

## 3. Degraded rejim

- [ ] Backend qasddan buzilgan holda (masalan sidecar nomini vaqtincha o‘zgartirish): ilova **darhol yopilmasin**, xabar chiqadi, UI ochiladi yoki boot ekranda xato + **Qayta urinish**.
- [ ] **Qayta urinish** `retry_backend_start` + health loopni qayta ishga tushiradi.

## 4. Frontend boot

- [ ] Health so‘rovi osilib qolganda (simulyatsiya): umumiy kutish `~35s` atrofida timeout, so‘ng aniq xabar.
- [ ] `AppErrorBoundary`: render xatosida oq ekran o‘rniga fallback + “Sahifani yangilash”.

## 5. i18n / storage

- [ ] Brauzer/Tauri `localStorage` bloklangan profilda ilova import paytida yiqilmasin.

## 6. Kiosk fokus (ixtiyoriy)

- [ ] `GEEKS_POS_KIOSK_FOCUS_RECLAIM=1` bo‘lmaganda fokus qayta talab qilinmaydi.
- [ ] Kiosk do‘kon uchun: `GEEKS_POS_KIOSK_FOCUS_RECLAIM=1` bilan avvalgi xatti-harakat saqlanadi.

## 7. Xavfsizlik (tauri.conf)

- [ ] `allowlist.all` o‘chirilgan; `shell.open`, `http` scope, `window` ishlaydi.
- [ ] CSP yoqilganda POS asosiy oqimlari (login, savdo, API) ishlaydi.

---

**Tez regressiya (har reliz):** `--self-check` + bir marta to‘liq `tauri build` + bir marta cold-start.
