"""
Copy SQLite DB to a timestamped backup file (run from repo root or backend/).

Usage:
  python scripts/backup_sqlite.py
  python scripts/backup_sqlite.py --db backend/db.sqlite3 --out "%USERPROFILE%\\Documents\\GeeksPOS\\backups"
"""
import argparse
import shutil
from datetime import datetime
from pathlib import Path


def main():
    p = argparse.ArgumentParser()
    p.add_argument(
        "--db",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "backend" / "db.sqlite3",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=Path.home() / "Documents" / "GeeksPOS" / "backups",
    )
    p.add_argument("--keep", type=int, default=30, help="Retain N newest backups")
    args = p.parse_args()

    if not args.db.exists():
        raise SystemExit(f"Database not found: {args.db}")

    args.out.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = args.out / f"backup-{stamp}.sqlite3"
    shutil.copy2(args.db, dest)
    print(f"Backed up to {dest}")

    files = sorted(args.out.glob("backup-*.sqlite3"), key=lambda f: f.stat().st_mtime)
    for old in files[: -args.keep]:
        old.unlink(missing_ok=True)
        print(f"Removed old backup: {old}")


if __name__ == "__main__":
    main()
