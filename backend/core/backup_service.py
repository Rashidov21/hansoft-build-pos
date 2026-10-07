"""
Automatic local backup service for Hansoft POS (every 3 days).
"""
import logging
import shutil
from datetime import datetime, date, timedelta
from pathlib import Path
from django.conf import settings

logger = logging.getLogger(__name__)


def run_daily_local_backup_if_due(*, now=None) -> dict:
    """
    Automatic local backup scheduler hook. Creates backup every 3 days.
    
    Returns: {"ran": bool, "reason": str, "backup_path": str|None}
    """
    if now is None:
        from django.utils import timezone
        now = timezone.localtime()
    
    today = now.date()
    
    # Check if backup already ran in the last 3 days
    marker_file = Path.home() / "Documents" / "GeeksPOS" / "backups" / ".last_backup_date"
    marker_file.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        if marker_file.exists():
            last_backup_date_str = marker_file.read_text(encoding="utf-8").strip()
            last_backup_date = date.fromisoformat(last_backup_date_str)
            days_since_backup = (today - last_backup_date).days
            
            if days_since_backup < 3:
                return {
                    "ran": False,
                    "reason": f"Last backup was {days_since_backup} day(s) ago. Next backup in {3 - days_since_backup} day(s)",
                    "backup_path": None,
                }
    except (ValueError, OSError) as e:
        logger.warning(f"Could not read last backup date: {e}")
    
    # Create backup
    try:
        db_path = Path(settings.DATABASES["default"]["NAME"])
        if not db_path.exists():
            return {
                "ran": False,
                "reason": "Database file not found",
                "backup_path": None,
            }
        
        out = Path.home() / "Documents" / "GeeksPOS" / "backups"
        out.mkdir(parents=True, exist_ok=True)
        
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        dest = out / f"backup-{stamp}.sqlite3"
        
        shutil.copy2(db_path, dest)
        
        # Update marker file
        marker_file.write_text(today.isoformat(), encoding="utf-8")
        
        # Clean old backups (keep last 30)
        _cleanup_old_backups(out, keep=30)
        
        logger.info(f"Daily backup created: {dest}")
        
        return {
            "ran": True,
            "reason": "Backup created successfully",
            "backup_path": str(dest),
        }
    
    except Exception as e:
        logger.error(f"Daily backup failed: {e}")
        return {
            "ran": False,
            "reason": f"Backup failed: {str(e)}",
            "backup_path": None,
        }


def _cleanup_old_backups(backup_dir: Path, keep: int = 30):
    """Remove old backup files, keeping only the most recent N backups."""
    try:
        backup_files = sorted(
            backup_dir.glob("backup-*.sqlite3"),
            key=lambda f: f.stat().st_mtime,
            reverse=True
        )
        
        for old_backup in backup_files[keep:]:
            try:
                old_backup.unlink()
                logger.info(f"Removed old backup: {old_backup.name}")
            except OSError as e:
                logger.warning(f"Could not remove old backup {old_backup.name}: {e}")
    
    except Exception as e:
        logger.warning(f"Cleanup old backups failed: {e}")
