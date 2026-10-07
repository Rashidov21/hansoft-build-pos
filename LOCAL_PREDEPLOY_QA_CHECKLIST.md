# Geeks POS - Local Pre-Deploy QA Checklist

Use this checklist before building/releasing to POS monoblock.

Date: __________  
Tester: __________  
Branch/Commit: __________

## 1) Environment & Services

- [ ] Python venv created and activated
- [ ] Backend dependencies installed (`pip install -r requirements.txt`)
- [ ] Frontend dependencies installed (`npm install`)
- [ ] DB migrations applied (`python manage.py migrate`)
- [ ] Backend started on `127.0.0.1:8000`
- [ ] Frontend started (`npm run dev`) and UI opens in browser
- [ ] CSRF endpoint returns JSON (`/api/auth/csrf/`)

## 2) Automated Gates (Must Pass)

- [ ] Backend tests pass: `pytest -q`
- [ ] Frontend build passes: `npm run build`
- [ ] No new blocking errors in terminal logs

## 3) Auth & Role Access

Test with 3 users: `CASHIER`, `ADMIN`, `OWNER`.

- [ ] CASHIER login works
- [ ] ADMIN login works
- [ ] OWNER login works
- [ ] CASHIER cannot access admin area (`/admin` -> redirected to `/pos`)
- [ ] ADMIN can access catalog/settings/debt/admin pages
- [ ] OWNER can access same admin features as ADMIN

## 4) SalesHistory & Permission Rules

- [ ] CASHIER sees only own sales for today
- [ ] CASHIER does not see/trigger `Void` action
- [ ] ADMIN/OWNER can see all cashiers and date range history
- [ ] ADMIN/OWNER can void sale successfully
- [ ] Voided sale status updates correctly in history

## 5) POS Core Flow (End-to-End)

- [ ] Valid barcode scan adds item to cart
- [ ] Invalid barcode shows clear error, app does not crash
- [ ] Scan input focus returns after scan/error/close actions
- [ ] Quantity +/- works correctly
- [ ] Split payment works (CASH/CARD/DEBT combinations)
- [ ] Payment mismatch blocks completion with user message
- [ ] Debt payment requires customer info when DEBT used
- [ ] Successful complete sale returns sale ID and clears cart

## 6) Inventory & Accounting Integrity

- [ ] Stock decrements after sale
- [ ] Stock reverses after void
- [ ] Debt record updated correctly after debt sale
- [ ] Debt invariant remains valid after void/repay

## 7) Receipt & Printer Reliability

- [ ] Normal receipt generation works
- [ ] ESC/POS print path attempted successfully
- [ ] Printer failure does not block sale completion
- [ ] Fallback path works (plain/system/clipboard)
- [ ] Reprint last receipt works
- [ ] Uzbek/Russian text prints acceptably (transliteration fallback tested)

## 8) Stocktake & Admin Operations

- [ ] Stocktake session create works
- [ ] Set counted qty works
- [ ] Apply stocktake works and updates stock
- [ ] Backup Now creates backup file path

## 9) Audit & Safety

- [ ] Audit log has `sale_completed`
- [ ] Audit log has `sale_voided`
- [ ] Audit log has `debt_repayment`
- [ ] Audit log has stocktake events (`stocktake_created`, `stocktake_counted`, `stocktake_applied`)

## 10) Optional Desktop Shell Check (Tauri)

- [ ] `npm run tauri:dev` starts successfully (if Rust/MSVC ready)
- [ ] No `link.exe`/toolchain errors
- [ ] App window opens and basic POS flow works

## Final Go/No-Go

- [ ] GO - all critical checks passed  
- [ ] NO-GO - issues found (write below)

Notes / defects:

1. ____________________________________________
2. ____________________________________________
3. ____________________________________________

