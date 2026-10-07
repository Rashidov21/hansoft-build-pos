# Cloud sync (`SyncPushView`) — hozirgi holat va yo‘l xaritasi

## Hozirgi implementatsiya

[`backend/sync/views.py`](../backend/sync/views.py) — `CLOUD_PUSH_URL` muhit o‘zgaruvchisi bo‘lsa, `exported_at` bo‘sh bo‘lgan sotuvlarni ketma-ket POST qiladi; muvaffaqiyatda `exported_at` belgilanadi.

Cheklovlar:

- Bir qurilma / oddiy idempotent server deb taxmin qilingan; **konflikt hal qiluvchi** yo‘q
- Server 200 qaytarsa, lekin ma’lumot qisman yozilgan bo‘lsa, qayta urinishda sotuv **qayta yuborilmasligi** mumkin (server tomonida idempotent qabul kerak)

## Tavsiya etilgan keyingi qadamlar

1. **Server idempotency**: har bir sotuv uchun `sale_id` (UUID) bilan qabul qilish; takroriy POST — 200 + “already received”
2. **Javob kontrakti**: `{ "ok": true, "sale_id": "..." }` — client faqat `ok` bo‘lsa `exported_at` yangilaydi
3. **Retry**: `URLError` dan tashqari, 5xx uchun cheklangan retry + `export_last_error` maydonida xabar
4. **Batch**: bir nechta sotuvni bitta so‘rovda (ixtiyoriy) — tarmoq yukini kamaytirish

Lokal POS ishlashi uchun `CLOUD_PUSH_URL` ixtiyoriy; bulut yo‘q bo‘lsa bu modul ishlatilmaydi.
