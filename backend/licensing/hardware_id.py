"""Fallback machine id when Tauri `machine_id` is not used (e.g. browser dev)."""

from __future__ import annotations

import platform
import uuid


def get_fallback_hardware_id() -> str:
    node = uuid.getnode()
    return f"fallback-{platform.node() or 'host'}-{node:012x}"
