from __future__ import annotations

import mimetypes
import uuid
from pathlib import Path
from urllib import error as urlerror
from urllib import request as urlrequest


def _encode_multipart(*, fields: dict[str, str], file_field: str, file_name: str, file_bytes: bytes) -> tuple[bytes, str]:
    boundary = f"----geekspos-{uuid.uuid4().hex}"
    lines: list[bytes] = []
    for key, value in fields.items():
        lines.append(f"--{boundary}\r\n".encode("utf-8"))
        lines.append(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"))
        lines.append((value or "").encode("utf-8"))
        lines.append(b"\r\n")
    ctype = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
    lines.append(f"--{boundary}\r\n".encode("utf-8"))
    lines.append(
        (
            f'Content-Disposition: form-data; name="{file_field}"; filename="{file_name}"\r\n'
            f"Content-Type: {ctype}\r\n\r\n"
        ).encode("utf-8")
    )
    lines.append(file_bytes)
    lines.append(b"\r\n")
    lines.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(lines)
    return body, boundary


def upload_backup_to_remote(
    *,
    endpoint: str,
    auth_token: str,
    client_key: str,
    activation_key: str,
    hardware_id: str,
    backup_path: Path,
    timeout_sec: int = 45,
) -> dict:
    if not endpoint.strip():
        raise ValueError("Backup endpoint is empty.")
    if not auth_token.strip():
        raise ValueError("Backup auth token is empty.")
    if not client_key.strip():
        raise ValueError("Backup client key is empty.")
    if not activation_key.strip():
        raise ValueError("Activation key is empty.")
    if not hardware_id.strip():
        raise ValueError("Hardware ID is empty.")
    if not backup_path.exists():
        raise ValueError("Backup file not found.")

    file_bytes = backup_path.read_bytes()
    body, boundary = _encode_multipart(
        fields={
            "activation_key": activation_key.strip(),
            "hardware_id": hardware_id.strip(),
        },
        file_field="backup_file",
        file_name=backup_path.name,
        file_bytes=file_bytes,
    )
    req = urlrequest.Request(
        endpoint.strip(),
        method="POST",
        data=body,
        headers={
            "Authorization": f"Token {auth_token.strip()}",
            "X-CLIENT-KEY": client_key.strip(),
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        },
    )
    try:
        with urlrequest.urlopen(req, timeout=timeout_sec) as res:
            raw = res.read().decode("utf-8", errors="replace")
            import json

            payload = json.loads(raw) if raw else {}
            if not isinstance(payload, dict):
                raise ValueError("Backup upload response is not a JSON object.")
            return payload
    except urlerror.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise ValueError(f"Backup upload HTTP {e.code}: {detail[:500]}") from e
    except urlerror.URLError as e:
        raise ValueError(f"Backup upload network error: {e.reason}") from e
