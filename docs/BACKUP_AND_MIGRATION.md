# Backup and migration (Geeks POS)

## SQLite backup (critical)

The business ledger lives in `backend/db.sqlite3`.

### Automated copy

From the repository root:

```powershell
python scripts/backup_sqlite.py
```

Defaults:

- Source: `backend/db.sqlite3`
- Destination folder: `%USERPROFILE%\Documents\GeeksPOS\backups\`
- Retention: keep the newest **30** `backup-*.sqlite3` files

Override:

```powershell
python scripts/backup_sqlite.py --db path\to\db.sqlite3 --out D:\GeeksBackups --keep 60
```

### Restore (owner)

1. Stop the API process (`run_waitress.py` or packaged service).
2. Replace `backend/db.sqlite3` with a chosen backup file (keep an extra copy before overwriting).
3. Start the API again.

Never restore while the API is writing to the same DB file.

## Schema migrations (Django)

- Apply migrations with `python manage.py migrate` from the `backend/` directory.
- **Before migrating production data**, run `python scripts/backup_sqlite.py`.
- Ship schema changes only as Django migration files; avoid ad-hoc `ALTER TABLE` in the field.
- Data transforms should use Django **data migrations** (`RunPython`) when you need to rewrite rows.

## Desktop updates

After installing a new build:

1. Backup the SQLite file.
2. Run migrations (the installer/updater should run `manage.py migrate` after copying binaries).
3. Start the app.

## Phase 3 cloud push

Optional: set `CLOUD_PUSH_URL` and run:

```powershell
cd backend
python manage.py push_sales
```

Or `POST /api/sync/push-sales/` while authenticated (same logic).
