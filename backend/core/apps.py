from django.apps import AppConfig

_AUTO_Z_THREAD_STARTED = False
_AUTO_BACKUP_THREAD_STARTED = False
_AUTO_DEBT_REMINDER_THREAD_STARTED = False
_AUTO_LOW_STOCK_THREAD_STARTED = False
_SCHEDULERS_STARTED = False


def start_background_schedulers() -> bool:
    """
    Start Z/backup/debt/low-stock daemon threads (idempotent).

    Call after migrations succeed (run_waitress). When HANSOFT_DEFER_SCHEDULERS=1,
    CoreConfig.ready() skips auto-start so schemaless DB is not queried too early.
    """
    global _SCHEDULERS_STARTED
    if _SCHEDULERS_STARTED:
        return False

    import logging
    import os
    import sys
    import threading
    import time

    from django.utils import timezone

    # Django runserver autoreload: only child process.
    if "runserver" in sys.argv and os.environ.get("RUN_MAIN") != "true":
        return False

    _SCHEDULERS_STARTED = True
    logger = logging.getLogger(__name__)

    global _AUTO_Z_THREAD_STARTED
    if not _AUTO_Z_THREAD_STARTED and os.environ.get("ENABLE_AUTO_Z_SCHEDULER", "1") != "0":
        _AUTO_Z_THREAD_STARTED = True
        hhmm = (os.environ.get("AUTO_Z_REPORT_TIME", "23:00") or "23:00").strip()
        try:
            target_hour, target_minute = [int(x) for x in hhmm.split(":", 1)]
        except Exception:
            target_hour, target_minute = 23, 0

        def _loop():
            while True:
                try:
                    now = timezone.localtime()
                    if now.hour == target_hour and now.minute == target_minute:
                        from integrations.services import run_auto_daily_z_report_if_due

                        result = run_auto_daily_z_report_if_due(now=now)
                        logger.info("Auto Z-report scheduler tick: %s", result)
                        time.sleep(65)
                        continue
                except Exception as exc:
                    logger.warning("Auto Z-report scheduler error: %s", exc)
                time.sleep(20)

        threading.Thread(target=_loop, name="auto-z-report-scheduler", daemon=True).start()
        logger.info(
            "Auto Z-report scheduler started (daily at %02d:%02d)",
            target_hour,
            target_minute,
        )

    global _AUTO_BACKUP_THREAD_STARTED
    if not _AUTO_BACKUP_THREAD_STARTED and os.environ.get("ENABLE_AUTO_BACKUP", "1") != "0":
        _AUTO_BACKUP_THREAD_STARTED = True

        def _backup_loop():
            # Migratsiya tugaguncha birinchi tick ni kechiktirish (defer yo'lida ham xavfsiz).
            time.sleep(2)
            while True:
                try:
                    from core.backup_service import run_daily_local_backup_if_due
                    from integrations.services import run_telegram_db_backup_if_due

                    result = run_daily_local_backup_if_due()
                    if result.get("ran"):
                        logger.info("Auto backup created: %s", result)
                    else:
                        logger.info("Auto backup check: %s", result.get("reason"))

                    tg = run_telegram_db_backup_if_due()
                    if tg.get("ran"):
                        logger.info("Telegram DB backup sent: %s", tg)
                    else:
                        logger.info("Telegram DB backup check: %s", tg.get("reason"))
                except Exception as exc:
                    logger.warning("Auto backup scheduler error: %s", exc)

                time.sleep(1800)

        threading.Thread(target=_backup_loop, name="auto-backup-scheduler", daemon=True).start()
        logger.info("Auto backup scheduler started (local + Telegram DB)")

    global _AUTO_DEBT_REMINDER_THREAD_STARTED
    if (
        not _AUTO_DEBT_REMINDER_THREAD_STARTED
        and os.environ.get("ENABLE_AUTO_DEBT_REMINDER", "1") != "0"
    ):
        _AUTO_DEBT_REMINDER_THREAD_STARTED = True
        debt_hhmm = (os.environ.get("AUTO_DEBT_REMINDER_TIME", "09:00") or "09:00").strip()
        try:
            debt_hour, debt_minute = [int(x) for x in debt_hhmm.split(":", 1)]
        except Exception:
            debt_hour, debt_minute = 9, 0

        def _debt_reminder_loop():
            while True:
                try:
                    now = timezone.localtime()
                    if now.hour == debt_hour and now.minute == debt_minute:
                        from integrations.debt_reminders import run_auto_daily_debt_reminders_if_due

                        result = run_auto_daily_debt_reminders_if_due(now=now)
                        logger.info("Auto debt reminder scheduler tick: %s", result)
                        time.sleep(65)
                        continue
                except Exception as exc:
                    logger.warning("Auto debt reminder scheduler error: %s", exc)
                time.sleep(20)

        threading.Thread(
            target=_debt_reminder_loop, name="auto-debt-reminder-scheduler", daemon=True
        ).start()
        logger.info(
            "Auto debt reminder scheduler started (daily at %02d:%02d)",
            debt_hour,
            debt_minute,
        )

    global _AUTO_LOW_STOCK_THREAD_STARTED
    if not _AUTO_LOW_STOCK_THREAD_STARTED and os.environ.get("ENABLE_AUTO_LOW_STOCK", "1") != "0":
        _AUTO_LOW_STOCK_THREAD_STARTED = True
        low_hhmm = (os.environ.get("AUTO_LOW_STOCK_TIME", "08:00") or "08:00").strip()
        try:
            low_hour, low_minute = [int(x) for x in low_hhmm.split(":", 1)]
        except Exception:
            low_hour, low_minute = 8, 0

        def _low_stock_loop():
            while True:
                try:
                    now = timezone.localtime()
                    if now.hour == low_hour and now.minute == low_minute:
                        from integrations.services import run_auto_daily_low_stock_report_if_due

                        result = run_auto_daily_low_stock_report_if_due(now=now)
                        logger.info("Auto low-stock scheduler tick: %s", result)
                        time.sleep(65)
                        continue
                except Exception as exc:
                    logger.warning("Auto low-stock scheduler error: %s", exc)
                time.sleep(20)

        threading.Thread(
            target=_low_stock_loop, name="auto-low-stock-scheduler", daemon=True
        ).start()
        logger.info(
            "Auto low-stock scheduler started (daily at %02d:%02d)",
            low_hour,
            low_minute,
        )

    return True


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        # Enable WAL for SQLite (better concurrency for single-writer bursts)
        import os

        from django.db.backends.signals import connection_created
        from django.db.utils import OperationalError

        def _pragma(sender, connection, **kwargs):
            if connection.vendor == "sqlite":
                with connection.cursor() as c:
                    try:
                        c.execute("PRAGMA journal_mode=WAL;")
                    except OperationalError:
                        # Another process can temporarily hold a lock during startup.
                        # Keep serving with busy_timeout; next connections will retry WAL.
                        pass
                    c.execute("PRAGMA busy_timeout=30000;")

        connection_created.connect(_pragma)

        # Waitress bootstrap sets HANSOFT_DEFER_SCHEDULERS=1 until migrate finishes.
        if os.environ.get("HANSOFT_DEFER_SCHEDULERS") == "1":
            return
        start_background_schedulers()
