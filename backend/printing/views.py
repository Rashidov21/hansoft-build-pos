from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from types import SimpleNamespace

from catalog.models import ProductVariant
from core.permissions import IsAdminOrOwner, IsCashier
from sales.models import Sale

from .models import StoreSettings
from .receipt import (
    build_nakladnoy_dict,
    nakladnoy_escpos_bytes,
    nakladnoy_plain_text,
    receipt_plain_text,
    resolve_label_size,
    resolve_receipt_store_lang,
    sale_to_receipt_dict,
)
from .services import PrinterFactory


def _escpos_bundle_error_response(exc: BaseException):
    return Response(
        {
            "code": "ESCPOS_BUNDLE_ERROR",
            "detail": str(exc),
        },
        status=503,
    )
from .serializers import (
    HardwareConfigSerializer,
    LabelQueueSerializer,
    LabelSingleSerializer,
    NakladnoyEscposSerializer,
    StoreSettingsSerializer,
)


def _request_lang(request) -> str:
    return (request.headers.get("Accept-Language") or "uz").split(",")[0]


def _is_admin_or_owner(user) -> bool:
    if getattr(user, "is_superuser", False):
        return True
    profile = getattr(user, "profile", None)
    return getattr(profile, "role", None) in ("ADMIN", "OWNER")


def _has_sale_access(user, sale: Sale) -> bool:
    if _is_admin_or_owner(user):
        return True
    return sale.cashier_id == user.id


class StoreSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        obj = StoreSettings.get_solo()
        return Response(StoreSettingsSerializer(obj, context={"request": request}).data)

    def put(self, request):
        obj = StoreSettings.get_solo()
        ser = StoreSettingsSerializer(obj, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class HardwareConfigView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def get(self, request):
        obj = StoreSettings.get_solo()
        return Response(HardwareConfigSerializer(obj).data)

    def patch(self, request):
        """Cashier/admin: printer + scanner hardware fields only (subset of StoreSettings)."""
        obj = StoreSettings.get_solo()
        ser = HardwareConfigSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        obj.refresh_from_db()
        return Response(HardwareConfigSerializer(obj).data)


class ReceiptPayloadView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def get(self, request, sale_id):
        try:
            sale = Sale.objects.select_related("cashier").prefetch_related(
                "lines__variant__product__category",
                "lines__variant__product__product_category",
                "payments",
            ).get(
                pk=sale_id
            )
        except Sale.DoesNotExist:
            return Response({"code": "SALE_NOT_FOUND", "detail": "Sale not found."}, status=404)
        if not _has_sale_access(request.user, sale):
            return Response(
                {"code": "SALE_ACCESS_DENIED", "detail": "You do not have access to this sale."},
                status=403,
            )
        dto = sale_to_receipt_dict(sale, lang=_request_lang(request))
        return Response(
            {
                "receipt": dto,
                "plain_text": receipt_plain_text(dto),
                "escpos_base64": None,
            }
        )


class ReceiptEscposView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def get(self, request, sale_id):
        try:
            sale = Sale.objects.select_related("cashier").prefetch_related(
                "lines__variant__product__category",
                "lines__variant__product__product_category",
                "payments",
            ).get(
                pk=sale_id
            )
        except Sale.DoesNotExist:
            return Response({"code": "SALE_NOT_FOUND", "detail": "Sale not found."}, status=404)
        if not _has_sale_access(request.user, sale):
            return Response(
                {"code": "SALE_ACCESS_DENIED", "detail": "You do not have access to this sale."},
                status=403,
            )
        dto = sale_to_receipt_dict(sale, lang=_request_lang(request))
        settings = StoreSettings.get_solo()
        try:
            raw = PrinterFactory.render_receipt(receipt_dto=dto, settings=settings)
        except (FileNotFoundError, OSError) as exc:
            return _escpos_bundle_error_response(exc)
        import base64

        return Response(
            {
                "receipt": dto,
                "raw_base64": base64.b64encode(raw).decode("ascii"),
                "escpos_base64": base64.b64encode(raw).decode("ascii"),
                "printer_name": settings.receipt_printer_name,
                "printer_type": settings.receipt_printer_type,
                "receipt_width": dto.get("store", {}).get("receipt_width", "58mm"),
            }
        )


class NakladnoyEscposView(APIView):
    """Print pick-list / nakladnoy from cart lines. Does not create a Sale or touch stock."""

    permission_classes = [IsAuthenticated, IsCashier]

    def post(self, request):
        import base64
        from datetime import datetime

        ser = NakladnoyEscposSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        public_no = (data.get("public_no") or "").strip()
        if not public_no:
            public_no = "NK-" + datetime.now().strftime("%y%m%d-%H%M%S")
        dto = build_nakladnoy_dict(
            lines=data["lines"],
            cashier_username=getattr(request.user, "username", "") or "",
            public_no=public_no,
            lang=_request_lang(request),
            note=data.get("note") or "",
        )
        try:
            raw = nakladnoy_escpos_bytes(dto)
        except (FileNotFoundError, OSError) as exc:
            return _escpos_bundle_error_response(exc)
        settings = StoreSettings.get_solo()
        return Response(
            {
                "public_no": public_no,
                "nakladnoy": dto,
                "plain_text": nakladnoy_plain_text(dto),
                "raw_base64": base64.b64encode(raw).decode("ascii"),
                "escpos_base64": base64.b64encode(raw).decode("ascii"),
                "printer_name": settings.receipt_printer_name,
                "stock_changed": False,
            }
        )


class LabelEscposView(APIView):
    """Single sticker payload — cashier may reprint (catalog/stock UI gated separately)."""

    permission_classes = [IsAuthenticated, IsCashier]

    def post(self, request):
        import base64

        ser = LabelSingleSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        settings = StoreSettings.get_solo()
        size = resolve_label_size(settings, ser.validated_data.get("size"))
        try:
            v = ProductVariant.objects.select_related("product__category", "product").get(
                pk=ser.validated_data["variant_id"]
            )
        except ProductVariant.DoesNotExist:
            return Response({"code": "VARIANT_NOT_FOUND", "detail": "Variant not found."}, status=404)
        try:
            payload = PrinterFactory.render_label(
                label_payload={
                    "variant": v,
                    "size": size,
                    "copies": ser.validated_data.get("copies", 1),
                    "show_price": ser.validated_data.get("show_price"),
                },
                settings=settings,
            )
        except ValueError as exc:
            return Response({"code": "LABEL_BARCODE_REQUIRED", "detail": str(exc)}, status=400)
        except (FileNotFoundError, OSError) as exc:
            return _escpos_bundle_error_response(exc)
        return Response(
            {
                "raw_base64": base64.b64encode(payload).decode("ascii"),
                "escpos_base64": base64.b64encode(payload).decode("ascii"),
                "printer_name": settings.label_printer_name,
                "printer_type": settings.label_printer_type,
                "size": size,
            }
        )


class LabelQueueEscposView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def post(self, request):
        import base64

        ser = LabelQueueSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        settings = StoreSettings.get_solo()
        size = resolve_label_size(settings, ser.validated_data.get("size"))
        show_price = ser.validated_data.get("show_price")
        out = []
        requested_ids = [str(item["variant_id"]) for item in ser.validated_data["items"]]
        variants = ProductVariant.objects.select_related("product__category", "product").filter(
            pk__in=requested_ids
        )
        by_id = {str(v.id): v for v in variants}
        missing = [vid for vid in requested_ids if vid not in by_id]
        if missing:
            return Response(
                {"code": "VARIANT_NOT_FOUND", "detail": f"Variant not found: {missing[0]}"},
                status=404,
            )
        for item in ser.validated_data["items"]:
            v = by_id[str(item["variant_id"])]
            try:
                payload = PrinterFactory.render_label(
                    label_payload={"variant": v, "size": size, "copies": item["copies"], "show_price": show_price},
                    settings=settings,
                )
            except ValueError as exc:
                return Response({"code": "LABEL_BARCODE_REQUIRED", "detail": str(exc)}, status=400)
            except (FileNotFoundError, OSError) as exc:
                return _escpos_bundle_error_response(exc)
            out.append(
                {
                    "variant_id": str(v.id),
                    "barcode": v.barcode,
                    "raw_base64": base64.b64encode(payload).decode("ascii"),
                    "escpos_base64": base64.b64encode(payload).decode("ascii"),
                }
            )
        return Response(
            {
                "items": out,
                "size": size,
                "printer_name": settings.label_printer_name,
                "printer_type": settings.label_printer_type,
            }
        )


class TestReceiptPrintView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def post(self, request):
        import base64

        from django.utils import timezone as dj_tz

        settings = StoreSettings.get_solo()
        test_lang = resolve_receipt_store_lang(settings, request.headers.get("Accept-Language") or "uz")
        now_display = dj_tz.localtime().strftime("%Y-%m-%d %H:%M")
        # Sample amounts so hardware test shows layout/totals (not zeros).
        dto = {
            "sale_id": "TEST-RECEIPT",
            "public_sale_no": "T-000001",
            "completed_at": now_display,
            "cashier": getattr(request.user, "username", None) or "admin",
            "subtotal": "45000",
            "discount_total": "5000",
            "grand_total": "40000",
            "payments": [{"method": "CASH", "amount": "40000"}],
            "store": {
                "brand_name": settings.brand_name,
                "phone": settings.phone,
                "address": settings.address,
                "footer_note": settings.footer_note or "Сатып алганыңыз үчүн рахмат!",
                "transliterate_uz": settings.transliterate_uz,
                "encoding": settings.encoding,
                "lang": test_lang,
                "receipt_width": settings.receipt_width or "58mm",
                "receipt_font_size": int(getattr(settings, "receipt_font_size", 0) or 0),
                "receipt_printer_name": settings.receipt_printer_name or "",
                "receipt_printer_type": settings.receipt_printer_type,
                "label_printer_name": settings.label_printer_name or "",
                "label_printer_type": settings.label_printer_type,
            },
            "lines": [
                {
                    "name": "Demo tovar / Тест",
                    "barcode": "20000001",
                    "qty": "2",
                    "unit": "20000",
                    "total": "40000",
                },
                {
                    "name": "Armatura 12 mm",
                    "barcode": "20000002",
                    "qty": "1",
                    "unit": "5000",
                    "total": "5000",
                },
            ],
        }
        try:
            raw = PrinterFactory.render_receipt(receipt_dto=dto, settings=settings)
        except (FileNotFoundError, OSError) as exc:
            return _escpos_bundle_error_response(exc)
        encoded = base64.b64encode(raw).decode("ascii")
        return Response(
            {
                "raw_base64": encoded,
                "escpos_base64": encoded,
                "printer_name": settings.receipt_printer_name,
                "printer_type": settings.receipt_printer_type,
            }
        )


class TestLabelPrintView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        import base64

        settings = StoreSettings.get_solo()
        size = resolve_label_size(settings, None)
        # custom_name_* filled so TSPL/ESC/POS name line is not empty on test stickers.
        variant = SimpleNamespace(
            barcode="TEST123456",
            list_price="100000",
            show_price_on_label=True,
            product=SimpleNamespace(
                name_uz="Demo tovar",
                name_ru="Demo tovar",
                name_uz_cyrillic="",
                custom_name_uz="Demo tovar",
                custom_name_ru="Demo tovar",
                custom_name_uz_cyrillic="",
                category=SimpleNamespace(name_uz="BrandCat"),
            ),
        )
        try:
            raw = PrinterFactory.render_label(
                label_payload={"variant": variant, "size": size, "copies": 1, "show_price": True},
                settings=settings,
            )
        except (FileNotFoundError, OSError) as exc:
            return _escpos_bundle_error_response(exc)
        encoded = base64.b64encode(raw).decode("ascii")
        return Response(
            {
                "raw_base64": encoded,
                "escpos_base64": encoded,
                "printer_name": settings.label_printer_name,
                "printer_type": settings.label_printer_type,
                "size": size,
            }
        )
