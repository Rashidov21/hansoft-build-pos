from decimal import Decimal

from rest_framework import serializers

from .models import StoreSettings


def _validate_label_direction(value: int) -> int:
    if value not in (0, 1):
        raise serializers.ValidationError("label_direction must be 0 or 1.")
    return value


class StoreSettingsSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = StoreSettings
        fields = [
            "id",
            "brand_name",
            "phone",
            "address",
            "footer_note",
            "logo",
            "logo_url",
            "encoding",
            "transliterate_uz",
            "receipt_lang",
            "receipt_printer_name",
            "receipt_printer_type",
            "receipt_printer_port",
            "label_printer_name",
            "label_printer_type",
            "label_printer_port",
            "label_printing_enabled",
            "default_label_size",
            "label_gap_mm",
            "label_direction",
            "receipt_width",
            "receipt_font_size",
            "receipt_render_mode",
            "receipt_printing_enabled",
            "auto_print_on_sale",
            "scanner_mode",
            "scanner_prefix",
            "scanner_suffix",
            "lock_timeout_minutes",
            "low_stock_threshold",
            "show_price_on_labels_default",
            "show_selling_price_in_catalog",
            "updated_at",
        ]
        read_only_fields = ["id", "logo_url", "updated_at"]

    def validate_receipt_render_mode(self, value):
        v = (value or "text").strip().lower()
        if v not in ("text", "image"):
            raise serializers.ValidationError("receipt_render_mode must be text or image.")
        return v

    def validate_receipt_lang(self, value):
        v = (value or "").strip().lower()
        if not v:
            return ""
        if v in ("uz", "ru", "ky"):
            return v
        raise serializers.ValidationError("receipt_lang must be uz, ru, ky, or empty for auto.")

    def validate_label_direction(self, value):
        return _validate_label_direction(int(value))

    def validate_label_gap_mm(self, value):
        gap = Decimal(str(value))
        if gap < Decimal("0.5") or gap > Decimal("20"):
            raise serializers.ValidationError("label_gap_mm must be between 0.5 and 20.")
        return gap

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.logo.url)
        return obj.logo.url


_LABEL_SIZE_CHOICES = ["30x20", "40x30", "40x50", "50x40", "58mm"]


class _LabelSizeMixin:
    """Treat missing/blank size as None so views resolve store default_label_size."""

    def validate_size(self, value):
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value


class LabelSingleSerializer(_LabelSizeMixin, serializers.Serializer):
    variant_id = serializers.UUIDField()
    size = serializers.ChoiceField(
        choices=_LABEL_SIZE_CHOICES,
        required=False,
        allow_null=True,
        allow_blank=True,
        default=None,
    )
    copies = serializers.IntegerField(min_value=1, max_value=200, required=False, default=1)
    show_price = serializers.BooleanField(required=False, allow_null=True)


class LabelQueueItemSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    copies = serializers.IntegerField(min_value=1, max_value=200)


class LabelQueueSerializer(_LabelSizeMixin, serializers.Serializer):
    size = serializers.ChoiceField(
        choices=_LABEL_SIZE_CHOICES,
        required=False,
        allow_null=True,
        allow_blank=True,
        default=None,
    )
    items = LabelQueueItemSerializer(many=True)
    show_price = serializers.BooleanField(required=False, allow_null=True)


class HardwareConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreSettings
        fields = [
            "receipt_printer_name",
            "receipt_printer_type",
            "receipt_printer_port",
            "label_printer_name",
            "label_printer_type",
            "label_printer_port",
            "label_printing_enabled",
            "default_label_size",
            "label_gap_mm",
            "label_direction",
            "receipt_width",
            "receipt_render_mode",
            "receipt_printing_enabled",
            "auto_print_on_sale",
            "scanner_mode",
            "scanner_prefix",
            "scanner_suffix",
            "lock_timeout_minutes",
        ]

    def validate_label_direction(self, value):
        return _validate_label_direction(int(value))

    def validate_receipt_render_mode(self, value):
        v = (value or "text").strip().lower()
        if v not in ("text", "image"):
            raise serializers.ValidationError("receipt_render_mode must be text or image.")
        return v


class NakladnoyLineSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=500)
    qty = serializers.DecimalField(
        max_digits=12, decimal_places=3, min_value=Decimal("0.001")
    )
    unit = serializers.CharField(max_length=16, required=False, default="dona", allow_blank=True)
    unit_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0")
    )
    line_total = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True
    )


class NakladnoyEscposSerializer(serializers.Serializer):
    """Pick-list print payload (A1: no stock change)."""

    lines = NakladnoyLineSerializer(many=True, allow_empty=False)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    public_no = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
