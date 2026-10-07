"""SQLite WAL / busy_timeout for multi-kassa concurrency."""

from pathlib import Path

import pytest
from django.db import connection


@pytest.mark.django_db
def test_sqlite_journal_mode_wal_or_memory_for_tests():
    """Production file DB uses WAL (core.apps); pytest :memory: reports 'memory'."""
    with connection.cursor() as c:
        c.execute("PRAGMA journal_mode;")
        mode = str((c.fetchone() or [""])[0]).lower()
    assert mode in ("wal", "memory")


@pytest.mark.django_db
def test_sqlite_busy_timeout_set():
    with connection.cursor() as c:
        c.execute("PRAGMA busy_timeout;")
        row = c.fetchone()
    assert row is not None
    assert int(row[0]) >= 1000


def test_core_apps_enables_wal_pragma():
    text = Path(__file__).resolve().parents[1].joinpath("core", "apps.py").read_text(
        encoding="utf-8"
    )
    assert "journal_mode=WAL" in text
    assert "busy_timeout" in text
