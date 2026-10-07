# Catalog Management Commands

## seed_suppliers

Creates demo suppliers with transaction history for testing pagination and supplier features.

### Usage

```bash
python manage.py seed_suppliers
```

### What it creates

- **3 Suppliers:**
  - Toshkent Optom (Ташкент Оптом)
  - Samarqand Savdo (Самарканд Торговля)
  - Buxoro Texnika (Бухара Техника)

- **25 Transactions per supplier:**
  - Mix of PURCHASE (debt) and PAYMENT transactions
  - Alternating pattern: 2 purchases, 1 payment
  - Amounts range from 500,000 to 2,500,000 UZS
  - Transactions span 60 days in the past

### Testing Pagination

With 25 transactions per supplier and 10 transactions per page:
- **Page 1:** Transactions 1-10
- **Page 2:** Transactions 11-20
- **Page 3:** Transactions 21-25

### Features to Test

1. **Pagination Controls:**
   - Navigate between pages using Previous/Next buttons
   - Click page numbers to jump to specific pages
   - Verify "Showing X-Y of Z" counter

2. **Transaction Filters:**
   - Filter by "All" (shows all 25 transactions)
   - Filter by "Payment" (shows ~8 payment transactions)
   - Filter by "Debt" (shows ~17 purchase transactions)
   - Pagination resets to page 1 when changing filters

3. **Supplier Balance:**
   - Each supplier will have a positive balance (debt owed to supplier)
   - Total debt and total paid amounts are calculated correctly

### Re-running the Command

The command is idempotent:
- If suppliers already exist, it will skip creation and show a warning
- Transactions will be added each time the command runs
- To start fresh, delete the suppliers from the admin panel or database first

### Clean Up

To remove test data:
```bash
# Delete all suppliers (this will cascade delete transactions)
python manage.py shell
>>> from catalog.models import Supplier
>>> Supplier.objects.filter(name_uz__in=["Toshkent Optom", "Samarqand Savdo", "Buxoro Texnika"]).delete()
```
