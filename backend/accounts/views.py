from django.contrib.auth import authenticate
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import User
from django.middleware.csrf import get_token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token
from accounts.models import Role
from core.permissions import IsAdminOrOwner


def _resolve_role(user) -> str:
    # Superuser should behave as top-level manager in UI/API checks.
    if getattr(user, "is_superuser", False):
        return str(Role.OWNER)
    profile = getattr(user, "profile", None)
    raw_role = getattr(profile, "role", Role.CASHIER) or Role.CASHIER
    role = str(raw_role).upper()
    if role in {Role.CASHIER, Role.ADMIN, Role.OWNER}:
        return str(role)
    return str(Role.CASHIER)


def _token_login_payload(user: User) -> dict:
    token, _ = Token.objects.get_or_create(user=user)
    return {
        "token": token.key,
        "user": {
            "username": user.username,
            "role": _resolve_role(user),
        },
    }


class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(request, username=username, password=password)
        if not user:
            return Response(
                {"code": "INVALID_CREDENTIALS", "detail": "Invalid credentials"}, status=400
            )
        return Response(_token_login_payload(user))


class PinUsersView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        rows = []
        for user in User.objects.filter(is_active=True).select_related("profile").order_by("username"):
            role = _resolve_role(user)
            profile = getattr(user, "profile", None)
            pin_enabled = bool(profile and profile.pin_enabled)
            if not pin_enabled:
                continue
            rows.append(
                {
                    "username": user.username,
                    "display_name": user.get_full_name() or user.username,
                    "role": role,
                    "pin_enabled": pin_enabled,
                }
            )
        return Response({"results": rows})


class PinLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        pin = str(request.data.get("pin") or "").strip()
        if not username or len(pin) != 4 or not pin.isdigit():
            return Response({"code": "INVALID_PIN", "detail": "pin must be 4 digits"}, status=400)
        try:
            user = User.objects.select_related("profile").get(username=username, is_active=True)
        except User.DoesNotExist:
            return Response({"code": "INVALID_CREDENTIALS", "detail": "Invalid credentials"}, status=400)
        profile = getattr(user, "profile", None)
        if not profile or not profile.pin_enabled or not profile.pin_hash:
            return Response({"code": "PIN_NOT_SET", "detail": "PIN is not configured"}, status=400)
        if not check_password(pin, profile.pin_hash):
            return Response({"code": "INVALID_PIN", "detail": "PIN mismatch"}, status=400)
        return Response(_token_login_payload(user))


class SetUserPinView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        pin = str(request.data.get("pin") or "").strip()
        enabled = bool(request.data.get("enabled", True))
        if not username:
            return Response({"code": "USERNAME_REQUIRED"}, status=400)
        if enabled and (len(pin) != 4 or not pin.isdigit()):
            return Response({"code": "INVALID_PIN", "detail": "pin must be 4 digits"}, status=400)
        try:
            user = User.objects.select_related("profile").get(username=username)
        except User.DoesNotExist:
            return Response({"code": "USER_NOT_FOUND"}, status=404)
        profile = getattr(user, "profile", None)
        if not profile:
            return Response({"code": "PROFILE_NOT_FOUND"}, status=404)
        profile.pin_enabled = enabled
        profile.pin_hash = make_password(pin) if enabled else ""
        profile.save(update_fields=["pin_enabled", "pin_hash"])
        return Response({"ok": True})


class LogoutView(APIView):
    def post(self, request):
        if getattr(request, "auth", None):
            request.auth.delete()
        return Response({"ok": True})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        role = _resolve_role(u)
        return Response({"username": u.username, "role": role})


class UserListView(APIView):
    """List all users with their details (Admin/Owner only)"""
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request):
        users = User.objects.filter(is_active=True).select_related("profile").order_by("username")
        results = []
        for user in users:
            profile = getattr(user, "profile", None)
            results.append({
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "role": _resolve_role(user),
                "pin_enabled": bool(profile and profile.pin_enabled),
                "is_superuser": user.is_superuser,
                "date_joined": user.date_joined.isoformat() if user.date_joined else None,
            })
        return Response({"results": results})


class UserCreateView(APIView):
    """Create a new user (Admin/Owner only)"""
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = (request.data.get("password") or "").strip()
        first_name = (request.data.get("first_name") or "").strip()
        last_name = (request.data.get("last_name") or "").strip()
        email = (request.data.get("email") or "").strip()
        role = (request.data.get("role") or Role.CASHIER).strip().upper()
        pin = str(request.data.get("pin") or "").strip()
        pin_enabled = bool(request.data.get("pin_enabled", False))

        # Validation
        if not username or len(username) < 3:
            return Response(
                {"code": "INVALID_USERNAME", "detail": "Username must be at least 3 characters"},
                status=400
            )
        if not password or len(password) < 4:
            return Response(
                {"code": "INVALID_PASSWORD", "detail": "Password must be at least 4 characters"},
                status=400
            )
        if role not in [Role.CASHIER, Role.ADMIN, Role.OWNER]:
            return Response({"code": "INVALID_ROLE", "detail": "Invalid role"}, status=400)
        if pin_enabled and (len(pin) != 4 or not pin.isdigit()):
            return Response({"code": "INVALID_PIN", "detail": "PIN must be 4 digits"}, status=400)
        
        # Check if username already exists
        if User.objects.filter(username=username).exists():
            return Response(
                {"code": "USERNAME_EXISTS", "detail": "Username already exists"},
                status=400
            )

        # Create user
        user = User.objects.create_user(
            username=username,
            password=password,
            first_name=first_name,
            last_name=last_name,
            email=email,
        )

        # Create or update profile
        from accounts.models import UserProfile
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = role
        profile.pin_enabled = pin_enabled
        profile.pin_hash = make_password(pin) if pin_enabled and pin else ""
        profile.save()

        return Response({
            "id": user.id,
            "username": user.username,
            "role": role,
        }, status=201)


class UserDetailView(APIView):
    """Get, update, or delete a specific user (Admin/Owner only)"""
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request, user_id):
        try:
            user = User.objects.select_related("profile").get(id=user_id, is_active=True)
        except User.DoesNotExist:
            return Response({"code": "USER_NOT_FOUND"}, status=404)

        profile = getattr(user, "profile", None)
        return Response({
            "id": user.id,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "role": _resolve_role(user),
            "pin_enabled": bool(profile and profile.pin_enabled),
            "is_superuser": user.is_superuser,
        })

    def patch(self, request, user_id):
        try:
            user = User.objects.select_related("profile").get(id=user_id, is_active=True)
        except User.DoesNotExist:
            return Response({"code": "USER_NOT_FOUND"}, status=404)

        # Prevent editing superuser
        if user.is_superuser and not request.user.is_superuser:
            return Response({"code": "PERMISSION_DENIED"}, status=403)

        # Update basic fields
        if "first_name" in request.data:
            user.first_name = (request.data["first_name"] or "").strip()
        if "last_name" in request.data:
            user.last_name = (request.data["last_name"] or "").strip()
        if "email" in request.data:
            user.email = (request.data["email"] or "").strip()
        
        # Update password if provided
        if "password" in request.data:
            password = (request.data["password"] or "").strip()
            if password and len(password) >= 4:
                user.set_password(password)
            elif password:
                return Response(
                    {"code": "INVALID_PASSWORD", "detail": "Password must be at least 4 characters"},
                    status=400
                )
        
        user.save()

        # Update profile
        profile = getattr(user, "profile", None)
        if profile:
            if "role" in request.data:
                role = (request.data["role"] or "").strip().upper()
                if role in [Role.CASHIER, Role.ADMIN, Role.OWNER]:
                    profile.role = role
            
            if "pin_enabled" in request.data:
                profile.pin_enabled = bool(request.data["pin_enabled"])
            
            if "pin" in request.data:
                pin = str(request.data["pin"] or "").strip()
                if pin:
                    if len(pin) == 4 and pin.isdigit():
                        profile.pin_hash = make_password(pin)
                        profile.pin_enabled = True
                    else:
                        return Response({"code": "INVALID_PIN", "detail": "PIN must be 4 digits"}, status=400)
            
            profile.save()

        return Response({
            "id": user.id,
            "username": user.username,
            "role": _resolve_role(user),
        })

    def delete(self, request, user_id):
        try:
            user = User.objects.get(id=user_id, is_active=True)
        except User.DoesNotExist:
            return Response({"code": "USER_NOT_FOUND"}, status=404)

        # Prevent deleting superuser
        if user.is_superuser:
            return Response({"code": "CANNOT_DELETE_SUPERUSER"}, status=403)
        
        # Prevent deleting self
        if user.id == request.user.id:
            return Response({"code": "CANNOT_DELETE_SELF"}, status=403)

        # Soft delete
        user.is_active = False
        user.save()

        return Response({"ok": True}, status=204)


class ShiftStatusView(APIView):
    """Check if the current user has an open shift."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from expenses.models import Shift

        open_shift = (
            Shift.objects.filter(cashier=request.user, status=Shift.Status.OPEN)
            .order_by("-opened_at")
            .first()
        )

        if open_shift:
            return Response({
                "has_open_shift": True,
                "shift_id": str(open_shift.id),
                "opened_at": open_shift.opened_at.isoformat(),
                "cashier_username": open_shift.cashier.username,
                "duration_seconds": int(open_shift.duration_seconds),
            })

        return Response({"has_open_shift": False})


class OpenShiftView(APIView):
    """Open a new shift for the current user."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from expenses.models import Shift

        existing = (
            Shift.objects.filter(cashier=request.user, status=Shift.Status.OPEN)
            .order_by("-opened_at")
            .first()
        )
        if existing:
            return Response({
                "code": "SHIFT_ALREADY_OPEN",
                "detail": "You already have an open shift",
                "shift_id": str(existing.id),
            }, status=400)

        shift = Shift.objects.create(
            cashier=request.user,
            status=Shift.Status.OPEN,
        )

        return Response({
            "shift_id": str(shift.id),
            "opened_at": shift.opened_at.isoformat(),
            "status": shift.status,
        }, status=201)


class CloseShiftView(APIView):
    """Close the current user's open shift and send daily Z-report if channels are ready."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.utils import timezone
        from expenses.models import Shift

        shift = (
            Shift.objects.filter(cashier=request.user, status=Shift.Status.OPEN)
            .order_by("-opened_at")
            .first()
        )
        if not shift:
            return Response({
                "code": "NO_OPEN_SHIFT",
                "detail": "No open shift found",
            }, status=404)

        shift.status = Shift.Status.CLOSED
        shift.closed_at = timezone.now()
        shift.save(update_fields=["status", "closed_at"])

        report: dict | None = None
        try:
            from integrations.services import resolve_report_lang, send_daily_z_report

            preferred = (request.headers.get("Accept-Language") or "").split(",")[0]
            report = send_daily_z_report(lang=resolve_report_lang(preferred=preferred or None))
            if report.get("ok"):
                shift.report_sent = True
                shift.report_sent_at = timezone.now()
                shift.save(update_fields=["report_sent", "report_sent_at"])
        except Exception as exc:
            report = {"ok": False, "details": str(exc)}

        return Response({
            "shift_id": str(shift.id),
            "opened_at": shift.opened_at.isoformat(),
            "closed_at": shift.closed_at.isoformat(),
            "duration_seconds": int(shift.duration_seconds),
            "status": shift.status,
            "report_sent": bool(shift.report_sent),
            "report": report,
        })


class MarkShiftReportSentView(APIView):
    """Mark that the shift report was sent (e.g. WhatsApp/Telegram Z-report)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.utils import timezone
        from expenses.models import Shift

        shift_id = request.data.get("shift_id")
        if not shift_id:
            return Response({"code": "SHIFT_ID_REQUIRED"}, status=400)

        try:
            shift = Shift.objects.get(id=shift_id, cashier=request.user)
        except Shift.DoesNotExist:
            return Response({"code": "SHIFT_NOT_FOUND"}, status=404)

        shift.report_sent = True
        shift.report_sent_at = timezone.now()
        shift.save(update_fields=["report_sent", "report_sent_at"])

        return Response({"ok": True})
