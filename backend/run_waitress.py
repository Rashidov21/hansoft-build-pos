"""
Run Hansoft POS API on 127.0.0.1 with Waitress (production-style local server).

Usage:
  python run_waitress.py
  python run_waitress.py --port 8765
  python run_waitress.py --self-check   # Django setup + migrate only, then exit 0

Tauri/desktop should spawn this script (or `waitress-serve`) after the app starts.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
import traceback
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
# Packaged sidecar: production default unless caller overrides (Tauri sets DJANGO_DEBUG=0).
if getattr(sys, "frozen", False):
    os.environ.setdefault("DJANGO_DEBUG", "0")

# PyInstaller onefile: modullar arxivdan chiqarilgan papkada; ba’zi muhitlarda import tartibini mustahkamlash.
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    meipass = sys._MEIPASS
    if meipass not in sys.path:
        sys.path.insert(0, meipass)


def _bootstrap_marker_dir() -> Path:
    """Writable GeeksPOS dir for bootstrap marker (mirrors settings fallbacks before Django loads)."""
    for key in ("APPDATA", "LOCALAPPDATA"):
        v = os.environ.get(key)
        if v:
            base = Path(v) / "GeeksPOS"
            try:
                base.mkdir(parents=True, exist_ok=True)
                return base
            except OSError:
                continue
    fallback = Path.home() / "GeeksPOS"
    try:
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback
    except OSError:
        return Path(__file__).resolve().parent.parent / ".geeks_pos"


def _bootstrap_marker_path() -> Path:
    base = _bootstrap_marker_dir()
    try:
        base.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return base / ".bootstrap_done"


def _resolve_db_path_early() -> Path | None:
    """DB fayl yo'li (django.setup dan oldin tekshirish uchun)."""
    override = os.environ.get("GEEKS_POS_DB_PATH", "").strip()
    allow = os.environ.get("GEEKS_POS_ALLOW_DB_OVERRIDE", "1") == "1"
    if override and allow:
        return Path(override)
    base = _bootstrap_marker_dir()
    return base / "db.sqlite3"


def _quarantine_corrupt_sqlite_if_needed() -> None:
    """
    Buzilgan SQLite ni arxivlab, migrate yangi bazani yaratishi uchun yo'l ochadi.
    Faqat dev (DJANGO_DEBUG=1) yoki GEEKS_POS_QUARANTINE_CORRUPT_DB=1 da.
    """
    quarantine_env = os.environ.get("GEEKS_POS_QUARANTINE_CORRUPT_DB", "").strip()
    if quarantine_env:
        enabled = quarantine_env == "1"
    else:
        enabled = os.environ.get("DJANGO_DEBUG", "0") == "1"
    if not enabled:
        return

    db_path = _resolve_db_path_early()
    if db_path is None or not db_path.is_file():
        return

    import sqlite3

    corrupt = False
    try:
        conn = sqlite3.connect(str(db_path), timeout=2)
        try:
            row = conn.execute("PRAGMA quick_check").fetchone()
            if row is None or row[0] != "ok":
                corrupt = True
        finally:
            conn.close()
    except sqlite3.DatabaseError:
        corrupt = True

    if not corrupt:
        return

    ts = int(time.time())
    backup = db_path.with_name(f"{db_path.name}.corrupt-{ts}.bak")
    try:
        db_path.rename(backup)
        print(f"WARN: Corrupt SQLite moved to {backup}", file=sys.stderr)
    except OSError as err:
        print(f"WARN: Could not quarantine corrupt DB: {err}", file=sys.stderr)
        return

    for suffix in ("-wal", "-shm"):
        sidecar = Path(str(db_path) + suffix)
        if sidecar.is_file():
            try:
                sidecar.unlink()
            except OSError:
                pass

    marker = _bootstrap_marker_path()
    if marker.is_file():
        try:
            marker.unlink()
        except OSError:
            pass


def _run_migrations_with_retry(max_attempts: int = 5) -> None:
    """
    Apply migrations after full Django initialization.

    call_command('migrate') must run only after django.setup(); otherwise
    AppRegistryNotReady / translation errors occur in packaged PyInstaller builds.

    Schedulers are deferred (HANSOFT_DEFER_SCHEDULERS) until migrate succeeds so
    backup/low-stock threads do not query missing columns on first upgrade boot.
    """
    import django
    from django.core.management import call_command

    _quarantine_corrupt_sqlite_if_needed()
    os.environ["HANSOFT_DEFER_SCHEDULERS"] = "1"
    try:
        django.setup()

        for attempt in range(1, max_attempts + 1):
            try:
                from accounts.bootstrap import ensure_default_users_and_pins
                call_command("migrate", interactive=False, verbosity=0)
                ensure_default_users_and_pins()
                print("Migrations OK.")
                return
            except Exception as exc:
                msg = str(exc).lower()
                retriable = (
                    "database is locked" in msg
                    or "locked" in msg
                    or "malformed" in msg
                    or "disk image" in msg
                )
                if ("malformed" in msg or "disk image" in msg) and attempt == 1:
                    _quarantine_corrupt_sqlite_if_needed()
                    continue
                print(f"MIGRATE_ATTEMPT_{attempt}: {type(exc).__name__}: {exc}", file=sys.stderr)
                if attempt >= max_attempts or not retriable:
                    traceback.print_exc(file=sys.stderr)
                    raise
                wait_s = min(8, 2 * attempt)
                print(f"Bootstrap retry {attempt}/{max_attempts} after lock: {exc}")
                time.sleep(wait_s)
    finally:
        os.environ.pop("HANSOFT_DEFER_SCHEDULERS", None)


def _start_schedulers_after_migrate() -> None:
    try:
        from core.apps import start_background_schedulers

        started = start_background_schedulers()
        print("SCHEDULERS_STARTED" if started else "SCHEDULERS_ALREADY_RUNNING")
    except Exception as exc:
        print(f"WARN: schedulers not started: {type(exc).__name__}: {exc}", file=sys.stderr)


def _self_check() -> int:
    """Smoke test for CI / post-build: setup + migrate + URL import resolution."""
    try:
        print("SELF_CHECK_START")
        from django.conf import settings
        print(f"DB_PATH={settings.DATABASES['default']['NAME']}")
        _run_migrations_with_retry()
        from django.urls import get_resolver

        # Force URLConf loading so dynamic include("config.api_urls")/include("*.urls")
        # failures are caught during build-time self-check.
        _ = get_resolver().url_patterns
        print("URLCONF_OK")
        # Sidecar / PyInstaller: ensure python-escpos ships capabilities.json next to the package.
        from pathlib import Path

        import escpos

        cap = Path(escpos.__file__).resolve().parent / "capabilities.json"
        if not cap.is_file():
            raise RuntimeError(f"escpos capabilities.json missing from bundle (expected {cap})")
        print("ESC_POS_CAPABILITIES_OK")
        print("SELF_CHECK_OK")
        return 0
    except Exception as exc:
        print(f"SELF_CHECK_FAIL: {type(exc).__name__}: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1


def _health_ok(port: int) -> bool:
    import json
    import urllib.error
    import urllib.request

    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/api/health/", timeout=2
        ) as resp:
            if resp.status != 200:
                return False
            body = json.loads(resp.read().decode("utf-8", errors="replace"))
            return (
                body.get("status") == "ok"
                and body.get("service") == "hansoft-build-pos-api"
            )
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError):
        return False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--threads", type=int, default=int(os.environ.get("WAITRESS_THREADS", "2")))
    parser.add_argument("--skip-bootstrap", action="store_true")
    parser.add_argument("--force-bootstrap", action="store_true")
    parser.add_argument(
        "--self-check",
        action="store_true",
        help="Run django.setup + migrate then exit (for build smoke tests).",
    )
    args = parser.parse_args()

    if args.self_check:
        raise SystemExit(_self_check())

    if _health_ok(args.port):
        print(f"BACKEND_ALREADY_RUNNING port={args.port}")
        raise SystemExit(0)

    from django.core.wsgi import get_wsgi_application
    from waitress import serve

    if not args.skip_bootstrap:
        # Always run migrations on startup (idempotent; upgrades apply new migrations).
        print("BOOTSTRAP_START")
        from django.conf import settings
        print(f"DB_PATH={settings.DATABASES['default']['NAME']}")
        try:
            _run_migrations_with_retry()
            _start_schedulers_after_migrate()
        except Exception as exc:
            print(f"BOOTSTRAP_FAIL: {type(exc).__name__}: {exc}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            raise

        # First-run marker (optional telemetry / support); never skip migrations when absent.
        marker = _bootstrap_marker_path()
        if args.force_bootstrap or not marker.exists():
            try:
                marker.write_text(str(int(time.time())), encoding="utf-8")
                print("BOOTSTRAP_MARKER_WRITTEN")
            except OSError as werr:
                print(f"WARN: could not write bootstrap marker: {werr}")
        print("BOOTSTRAP_DONE")

    application = get_wsgi_application()
    print(f"Hansoft POS API: http://{args.host}:{args.port}/")
    serve(application, host=args.host, port=args.port, threads=max(1, args.threads))


if __name__ == "__main__":
    main()
