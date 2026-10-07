"""Local Fernet wrapper: expiry is not stored as plain SQLite text."""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _fernet(hardware_id: str) -> Fernet:
    material = f"{settings.SECRET_KEY}|{hardware_id or 'unknown-hw'}".encode()
    key = base64.urlsafe_b64encode(hashlib.sha256(material).digest())
    return Fernet(key)


def encrypt_expiry_iso(*, hardware_id: str, expires_at_iso: str) -> bytes:
    return _fernet(hardware_id).encrypt(expires_at_iso.encode("utf-8"))


def decrypt_expiry_iso(*, hardware_id: str, ciphertext: bytes) -> str | None:
    if not ciphertext:
        return None
    try:
        return _fernet(hardware_id).decrypt(ciphertext).decode("utf-8")
    except InvalidToken:
        return None
