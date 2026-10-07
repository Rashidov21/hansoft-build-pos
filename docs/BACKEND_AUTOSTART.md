# Backend autostart (Windows)

Geeks POS UI and the Django backend run as **separate processes**.

## Behaviour

| Event | Backend |
|--------|---------|
| User logon | Scheduled task `GeeksPOS_Backend` may start `geeks_pos_backend.exe` (production install) |
| Open Geeks POS | UI checks `http://127.0.0.1:8000/api/health/`; does **not** kill an existing backend |
| Close Geeks POS window | Backend **keeps running** (default) |
| Reboot / shutdown | Backend stops with Windows |
| End Task on `geeks_pos_backend.exe` | Backend stops until next logon or manual start |

Starter script (written on each app launch in production):

- `%APPDATA%\GeeksPOS\start_backend_service.ps1`

Backups and DB:

- `%APPDATA%\GeeksPOS\db.sqlite3`
- `%APPDATA%\GeeksPOS\logs\backend_boot.log`

## Environment overrides

| Variable | Effect |
|----------|--------|
| `GEEKS_POS_KILL_BACKEND_ON_EXIT=1` | Legacy: stop backend when UI exits |
| `GEEKS_POS_DISABLE_BACKEND_AUTOSTART=1` | Do not register/update logon task |
| `GEEKS_POS_FORCE_RESTART_BACKEND=1` | Boot retry kills only UI-spawned child, then respawns |

## Verify

1. Install or run production build once (registers task).
2. Sign out / reboot.
3. Task Manager: `geeks_pos_backend.exe` running; health URL returns OK.
4. Open Geeks POS → login should appear within a few seconds.
5. Close Geeks POS → backend process still in Task Manager.

Manual task check:

```powershell
schtasks /Query /TN GeeksPOS_Backend /V /FO LIST
```
