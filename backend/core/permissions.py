from rest_framework.permissions import BasePermission

from accounts.models import Role


class _RolePermission(BasePermission):
    allowed_roles: tuple[str, ...] = tuple()

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        profile = getattr(request.user, "profile", None)
        if not profile:
            return False
        return profile.role in self.allowed_roles


class IsOwner(_RolePermission):
    allowed_roles = (Role.OWNER,)


class IsAdmin(_RolePermission):
    allowed_roles = (Role.ADMIN,)


class IsCashier(_RolePermission):
    allowed_roles = (Role.CASHIER, Role.OWNER, Role.ADMIN)


class IsAdminOrOwner(_RolePermission):
    allowed_roles = (Role.ADMIN, Role.OWNER)
