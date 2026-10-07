from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import User
from django.db import OperationalError, ProgrammingError

from .models import Role, UserProfile

DEFAULT_PIN = "1111"
LEGACY_PINS = ("1234",)
DEFAULT_USERS = (
    {"username": "admin", "password": "pass12345", "role": Role.ADMIN},
    {"username": "cashier", "password": "pass12345", "role": Role.CASHIER},
)


def ensure_default_users_and_pins() -> None:
    """
    Ensure baseline local users exist on fresh installations.
    PIN defaults are applied only when PIN is not configured yet,
    so later manual PIN changes are preserved.
    """
    try:
        for cfg in DEFAULT_USERS:
            user, created = User.objects.get_or_create(
                username=cfg["username"],
                defaults={"is_active": True},
            )
            if created:
                user.set_password(cfg["password"])
                user.save(update_fields=["password"])

            profile, _ = UserProfile.objects.get_or_create(user=user)
            updates: list[str] = []
            if profile.role != cfg["role"]:
                profile.role = cfg["role"]
                updates.append("role")
            if not profile.pin_enabled and not profile.pin_hash:
                profile.pin_enabled = True
                profile.pin_hash = make_password(DEFAULT_PIN)
                updates.extend(["pin_enabled", "pin_hash"])
            elif (
                profile.pin_enabled
                and profile.pin_hash
                and any(check_password(legacy, profile.pin_hash) for legacy in LEGACY_PINS)
                and not check_password(DEFAULT_PIN, profile.pin_hash)
            ):
                # Safe one-time upgrade for legacy demo installs (1234 -> 1111).
                # Custom operator PINs are preserved because they won't match legacy values.
                profile.pin_hash = make_password(DEFAULT_PIN)
                updates.append("pin_hash")
            if updates:
                profile.save(update_fields=updates)
    except (OperationalError, ProgrammingError):
        # DB may be unavailable during early startup/migrations.
        return
