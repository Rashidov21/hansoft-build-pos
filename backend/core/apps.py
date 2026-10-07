from django.apps import AppConfig

_AUTO_Z_THREAD_STARTED = False
_AUTO_BACKUP_THREAD_STARTED = False
_AUTO_DEBT_REMINDER_THREAD_STARTED = False


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        # Enable WAL for SQLite (better concurrency for single-writer bursts)
        import logging
        import os
        import sys
        import threading
        import time

        from django.utils import timezone
        from django.db.utils import OperationalError
        from django.db.backends.signals import connection_created

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

        logger = logging.getLogger(__name__)

        # Auto Z-Report Scheduler (daily at 23:00 by default)
        global _AUTO_Z_THREAD_STARTED
        if not _AUTO_Z_THREAD_STARTED and os.environ.get("ENABLE_AUTO_Z_SCHEDULER", "1") != "0":
            # Django runserver autoreload spawns parent/child; run scheduler only in child.
            if "runserver" not in sys.argv or os.environ.get("RUN_MAIN") == "true":
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

                t = threading.Thread(target=_loop, name="auto-z-report-scheduler", daemon=True)
                t.start()
                logger.info(
                    "Auto Z-report scheduler started (daily at %02d:%02d)",
                    target_hour,
                    target_minute,
                )

        # Auto Backup Scheduler (local copy every 3 days)
        global _AUTO_BACKUP_THREAD_STARTED
        if not _AUTO_BACKUP_THREAD_STARTED and os.environ.get("ENABLE_AUTO_BACKUP", "1") != "0":
            # Django runserver autoreload spawns parent/child; run scheduler only in child.
            if "runserver" not in sys.argv or os.environ.get("RUN_MAIN") == "true":
                _AUTO_BACKUP_THREAD_STARTED = True

                def _backup_loop():
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
                        
                        # Check every 30 minutes
                        time.sleep(1800)

                backup_thread = threading.Thread(target=_backup_loop, name="auto-backup-scheduler", daemon=True)
                backup_thread.start()
                logger.info("Auto backup scheduler started (local + Telegram DB)")

        # Daily WhatsApp debt reminders (open debts + product lines)
        global _AUTO_DEBT_REMINDER_THREAD_STARTED
        if not _AUTO_DEBT_REMINDER_THREAD_STARTED and os.environ.get("ENABLE_AUTO_DEBT_REMINDER", "1") != "0":
            if "runserver" not in sys.argv or os.environ.get("RUN_MAIN") == "true":
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

                debt_thread = threading.Thread(
                    target=_debt_reminder_loop, name="auto-debt-reminder-scheduler", daemon=True
                )
                debt_thread.start()
                logger.info(
                    "Auto debt reminder scheduler started (daily at %02d:%02d)",
                    debt_hour,
                    debt_minute,
                )
