from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from accounts.models import Role


def _normalized_role(user: User) -> str:
    if user.is_superuser:
        return Role.OWNER
    profile = getattr(user, "profile", None)
    raw = getattr(profile, "role", Role.CASHIER) or Role.CASHIER
    role = str(raw).upper()
    if role in {Role.CASHIER, Role.ADMIN, Role.OWNER}:
        return role
    return Role.CASHIER


class Command(BaseCommand):
    help = "Normalize all users' roles to CASHIER/ADMIN/OWNER; superusers -> OWNER"

    def handle(self, *args, **options):
        changed = 0
        for user in User.objects.all().select_related("profile"):
            profile = getattr(user, "profile", None)
            if not profile:
                continue
            target = _normalized_role(user)
            if profile.role != target:
                profile.role = target
                profile.save(update_fields=["role"])
                changed += 1
        self.stdout.write(self.style.SUCCESS(f"Normalized roles: {changed} user(s) updated"))
