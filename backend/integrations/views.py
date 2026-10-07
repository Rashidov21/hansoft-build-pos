import shutil
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrOwner, IsCashier
from debt.models import Customer, Debt
from licensing.services import get_license_state

from .backup_upload import upload_backup_to_remote
from .models import IntegrationSettings, ReportChannel, ReportRoute
from .serializers import (
    IntegrationSettingsSerializer,
    ReportChannelSerializer,
    ReportRouteSerializer,
)
from .debt_reminders import (
    build_debt_items_for_customer,
    customer_open_debt_total,
    run_auto_daily_debt_reminders_if_due,
    send_daily_debt_reminders_to_all_customers,
)
from .services import (
    send_daily_z_report,
    send_low_stock_report,
    send_whatsapp_reminder,
    send_whatsapp_text,
)


def _request_lang(request) -> str:
    from .services import resolve_report_lang

    header = (request.headers.get("Accept-Language") or "").split(",")[0]
    return resolve_report_lang(preferred=header or None)


class IntegrationSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request):
        from .report_routing import ensure_channels_from_legacy, ensure_default_routes

        ensure_default_routes()
        ensure_channels_from_legacy()
        obj = IntegrationSettings.get_solo()
        return Response(IntegrationSettingsSerializer(obj).data)

    def put(self, request):
        from .report_routing import ensure_channels_from_legacy

        obj = IntegrationSettings.get_solo()
        ser = IntegrationSettingsSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        ensure_channels_from_legacy()
        return Response(IntegrationSettingsSerializer(IntegrationSettings.get_solo()).data)


class ReportChannelListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request):
        from .report_routing import ensure_channels_from_legacy, ensure_default_routes

        ensure_default_routes()
        ensure_channels_from_legacy()
        qs = ReportChannel.objects.all().order_by("sort_order", "name")
        return Response(ReportChannelSerializer(qs, many=True).data)

    def post(self, request):
        from .report_routing import sync_legacy_chat_fields_from_channels

        ser = ReportChannelSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        sync_legacy_chat_fields_from_channels()
        return Response(ser.data, status=201)


class ReportChannelDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get_object(self, pk):
        try:
            return ReportChannel.objects.get(pk=pk)
        except ReportChannel.DoesNotExist:
            return None

    def put(self, request, pk):
        from .report_routing import sync_legacy_chat_fields_from_channels

        obj = self.get_object(pk)
        if not obj:
            return Response({"code": "NOT_FOUND", "detail": "Channel not found"}, status=404)
        ser = ReportChannelSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        sync_legacy_chat_fields_from_channels()
        return Response(ser.data)

    def delete(self, request, pk):
        from .report_routing import sync_legacy_chat_fields_from_channels

        obj = self.get_object(pk)
        if not obj:
            return Response({"code": "NOT_FOUND", "detail": "Channel not found"}, status=404)
        obj.delete()
        sync_legacy_chat_fields_from_channels()
        return Response(status=204)


class ReportRouteListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request):
        from .report_routing import ensure_channels_from_legacy, ensure_default_routes

        ensure_default_routes()
        ensure_channels_from_legacy()
        qs = ReportRoute.objects.prefetch_related("channels").all()
        return Response(ReportRouteSerializer(qs, many=True).data)


class ReportRouteDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def put(self, request, pk):
        try:
            obj = ReportRoute.objects.prefetch_related("channels").get(pk=pk)
        except ReportRoute.DoesNotExist:
            return Response({"code": "NOT_FOUND", "detail": "Route not found"}, status=404)
        ser = ReportRouteSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        obj.refresh_from_db()
        return Response(ReportRouteSerializer(obj).data)


class LowStockReportSendView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        try:
            out = send_low_stock_report(lang=_request_lang(request))
            if out.get("ok"):
                return Response(out)
            return Response(
                {"code": "LOW_STOCK_SEND_FAILED", "detail": out.get("details"), **out},
                status=400,
            )
        except ValueError as e:
            return Response({"code": "LOW_STOCK_SEND_FAILED", "detail": str(e)}, status=400)


class TelegramZReportSendView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def post(self, request):
        try:
            out = send_daily_z_report(lang=_request_lang(request))
            return Response(out)
        except ValueError as e:
            return Response({"code": "TELEGRAM_SEND_FAILED", "detail": str(e)}, status=400)


class ZReportSendView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def post(self, request):
        try:
            out = send_daily_z_report(lang=_request_lang(request))
            if out.get("ok"):
                return Response(out)
            return Response({"code": "ZREPORT_SEND_FAILED", "detail": out.get("details"), **out}, status=400)
        except ValueError as e:
            return Response({"code": "ZREPORT_SEND_FAILED", "detail": str(e)}, status=400)


class WhatsAppDebtReminderView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def post(self, request):
        customer_id = request.data.get("customer_id")
        if not customer_id:
            return Response({"code": "CUSTOMER_REQUIRED", "detail": "customer_id is required"}, status=400)
        try:
            customer = Customer.objects.get(pk=customer_id)
        except Customer.DoesNotExist:
            return Response({"code": "CUSTOMER_NOT_FOUND", "detail": "Customer not found"}, status=404)
        selected_lang = _request_lang(request)
        amount = request.data.get("amount")
        if amount is None:
            amount = str(customer_open_debt_total(customer))
        debt_items = build_debt_items_for_customer(customer, lang=selected_lang)
        try:
            out = send_whatsapp_reminder(
                phone=customer.phone_normalized,
                customer_name=customer.name,
                amount=str(amount),
                lang=selected_lang,
                debt_items=debt_items,
            )
            return Response(out)
        except ValueError as e:
            return Response({"code": "WHATSAPP_SEND_FAILED", "detail": str(e)}, status=400)


class DailyDebtReminderSendView(APIView):
    """Send debt reminders to all customers with open debt (manual trigger)."""

    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        try:
            out = send_daily_debt_reminders_to_all_customers(lang=_request_lang(request))
            return Response(out)
        except ValueError as e:
            return Response({"code": "WHATSAPP_SEND_FAILED", "detail": str(e)}, status=400)


class DailyDebtReminderAutoRunView(APIView):
    """Run scheduled daily debt reminders if not yet sent today (internal or owner)."""

    permission_classes = [AllowAny]
    authentication_classes = [SessionAuthentication]

    def post(self, request):
        internal_key = (getattr(settings, "INTERNAL_FLUSH_KEY", None) or "").strip()
        header = (request.headers.get("X-Internal-Key") or "").strip()
        remote = request.META.get("REMOTE_ADDR") or ""
        localhost = remote in ("127.0.0.1", "::1")
        if internal_key and header == internal_key and localhost:
            return Response(run_auto_daily_debt_reminders_if_due())
        if not request.user.is_authenticated or not (
            request.user.is_superuser or getattr(request.user, "role", None) in ("OWNER", "ADMIN")
        ):
            return Response({"code": "FORBIDDEN", "detail": "Not allowed"}, status=403)
        return Response(run_auto_daily_debt_reminders_if_due(require_scheduled_time=False))


@method_decorator(csrf_exempt, name="dispatch")
class NotificationQueueFlushView(APIView):
    """Flush pending outbound notifications (Tauri internal key or authenticated owner)."""

    permission_classes = [AllowAny]
    authentication_classes = [SessionAuthentication]

    def post(self, request):
        from .notification_queue import flush_pending

        internal_key = (getattr(settings, "INTERNAL_FLUSH_KEY", None) or "").strip()
        header = (request.headers.get("X-Internal-Key") or "").strip()
        remote = request.META.get("REMOTE_ADDR") or ""
        localhost = remote in ("127.0.0.1", "::1")
        try:
            limit = int(request.data.get("limit", 50))  # type: ignore[attr-defined]
        except (TypeError, ValueError):
            limit = 50

        if internal_key and header == internal_key:
            if not localhost:
                return Response(
                    {"code": "FORBIDDEN", "detail": "Internal flush is only allowed from localhost."},
                    status=403,
                )
            return Response(flush_pending(limit=limit))

        if not request.user.is_authenticated:
            return Response({"detail": "Authentication credentials were not provided."}, status=401)
        if not IsAdminOrOwner().has_permission(request, self):
            return Response({"detail": "You do not have permission to perform this action."}, status=403)
        return Response(flush_pending(limit=limit))


class BackupAutoRunView(APIView):
    """
    Creates a local DB backup and uploads it to remote endpoint if schedule allows.
    """

    permission_classes = [IsAuthenticated, IsCashier]

    @staticmethod
    def _make_local_backup() -> tuple[Path, int]:
        from django.conf import settings as dj_settings

        db_path = Path(dj_settings.DATABASES["default"]["NAME"])
        if not db_path.exists():
            raise ValueError("Database not found")
        out = Path.home() / "Documents" / "GeeksPOS" / "backups"
        out.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        dest = out / f"backup-{stamp}.sqlite3"
        shutil.copy2(db_path, dest)
        return dest, dest.stat().st_size

    def post(self, request):
        enabled = bool(getattr(settings, "BACKUP_UPLOAD_ENABLED", False))
        if not enabled:
            return Response({"status": "disabled"}, status=200)
        cfg = IntegrationSettings.get_solo()
        interval_hours = max(1, int(getattr(settings, "BACKUP_INTERVAL_HOURS", 24) or 24))
        force_raw = str(request.query_params.get("force") or request.data.get("force") or "").strip().lower()
        force = force_raw in {"1", "true", "yes", "on"}
        now_dt = timezone.now()
        if not force and cfg.backup_last_uploaded_at:
            next_at = cfg.backup_last_uploaded_at + timedelta(hours=interval_hours)
            if now_dt < next_at:
                return Response(
                    {
                        "status": "skipped",
                        "reason": "interval_not_reached",
                        "next_at": next_at.isoformat(),
                    },
                    status=200,
                )

        state = get_license_state()
        endpoint = (getattr(settings, "BACKUP_UPLOAD_URL", "") or "").strip()
        client_key = (getattr(settings, "BACKUP_CLIENT_KEY", "") or "").strip()
        activation_key = (state.license_key or "").strip()
        hardware_id = (state.hardware_id or "").strip()
        auth_token = (getattr(settings, "BACKUP_AUTH_TOKEN", "") or "").strip()

        try:
            backup_path, size_bytes = self._make_local_backup()
            result = upload_backup_to_remote(
                endpoint=endpoint,
                auth_token=auth_token,
                client_key=client_key,
                activation_key=activation_key,
                hardware_id=hardware_id,
                backup_path=backup_path,
            )
            cfg.backup_last_uploaded_at = now_dt
            cfg.save(update_fields=["backup_last_uploaded_at", "updated_at"])
            now = datetime.utcnow().isoformat() + "Z"
            return Response(
                {
                    "status": result.get("status") or "uploaded",
                    "hardware_id": result.get("hardware_id") or hardware_id,
                    "file_name": result.get("file_name") or str(backup_path.name),
                    "size_bytes": result.get("size_bytes") or size_bytes,
                    "uploaded_at": result.get("uploaded_at") or now,
                    "forced": force,
                },
                status=200,
            )
        except ValueError as e:
            return Response({"code": "BACKUP_UPLOAD_FAILED", "detail": str(e)}, status=400)


class WhatsAppSendTextView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def post(self, request):
        text = request.data.get("text")
        if not text:
            return Response({"code": "TEXT_REQUIRED", "detail": "text is required"}, status=400)
        phone = request.data.get("phone")
        try:
            out = send_whatsapp_text(text=text, phone=phone)
            return Response({"ok": True, "details": out})
        except ValueError as e:
            return Response({"code": "WHATSAPP_SEND_FAILED", "detail": str(e)}, status=400)


