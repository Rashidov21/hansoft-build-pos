import json
import logging
from datetime import datetime, timezone
from typing import Any

audit_logger = logging.getLogger("audit")


def log_audit(*, event_type: str, actor: str | None, entity_id: str | None, payload: dict[str, Any]):
    entry = {
        "event_type": event_type,
        "actor": actor,
        "entity_id": entity_id,
        "payload": payload,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    audit_logger.info(json.dumps(entry, default=str))
