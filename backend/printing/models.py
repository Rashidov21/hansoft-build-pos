import uuid
from decimal import Decimal

from django.db import models


class StoreSettings(models.Model):
    class PrinterType(models.TextChoices):
        ESC_POS = "ESC_POS", "ESC/POS"
        TSPL = "TSPL", "TSPL"

    class LabelSize(models.TextChoices):
        S_30X20 = "30x20", "30×20 mm"
        S_40X30 = "40x30", "40×30 mm"
        S_40X50 = "40x50", "40×50 mm"
        S_50X40 = "50x40", "50×40 mm"
        S_58MM = "58mm", "58×40 mm"

    class ReceiptRenderMode(models.TextChoices):
        TEXT = "text", "RAW text (ESC/POS codepage)"
        IMAGE = "image", "Bitmap image (Cyrillic-safe)"

    """Singleton-style store metadata for receipt header."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    brand_name = models.CharField(max_length=255, default="Hansoft POS")
    phone = models.CharField(max_length=64, blank=True, default="")
    address = models.CharField(max_length=500, blank=True, default="")
    footer_note = models.CharField(max_length=500, blank=True, default="Rahmat!")
    logo = models.ImageField(upload_to="store_logos/", null=True, blank=True)

    # Printer language / encoding behavior
    encoding = models.CharField(max_length=32, default="cp866")
    transliterate_uz = models.BooleanField(default=True)
    # Chek matnlari tili: '' (avto — Accept-Language), yoki uz | ru | ky.
    receipt_lang = models.CharField(max_length=8, blank=True, default="")
    receipt_printer_name = models.CharField(max_length=255, blank=True, default="")
    receipt_printer_type = models.CharField(
        max_length=16,
        choices=PrinterType.choices,
        default=PrinterType.ESC_POS,
    )
    # Optional Windows port hint (e.g. USB001) for routing when multiple printers share model names.
    receipt_printer_port = models.CharField(max_length=64, blank=True, default="")
    label_printer_name = models.CharField(max_length=255, blank=True, default="")
    label_printer_type = models.CharField(
        max_length=16,
        choices=PrinterType.choices,
        default=PrinterType.TSPL,
    )
    # Optional Windows port hint (e.g. USB002) for label printer.
    label_printer_port = models.CharField(max_length=64, blank=True, default="")
    # Master switch for sticker UI (catalog reprint / settings test). API still renders when called.
    label_printing_enabled = models.BooleanField(
        default=True,
        help_text="Enable label/sticker printing UI (disable if store has no label printer)",
    )
    # Default sticker stock size when client omits `size` (XP-365B common: 40×30).
    default_label_size = models.CharField(
        max_length=8,
        choices=LabelSize.choices,
        default=LabelSize.S_40X30,
    )
    # TSPL GAP between labels (mm) — sent as-is to the printer.
    label_gap_mm = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        default=Decimal("2.0"),
        help_text="TSPL GAP height in mm between labels on the roll",
    )
    # TSPL DIRECTION: 0 or 1 (printer-dependent feed orientation).
    label_direction = models.PositiveSmallIntegerField(
        default=1,
        help_text="TSPL DIRECTION command (0 or 1)",
    )
    receipt_width = models.CharField(max_length=8, default="58mm")
    # 0 => auto defaults (80mm=26, 58mm=22). Positive value overrides bitmap receipt font size.
    receipt_font_size = models.PositiveSmallIntegerField(default=0)
    # text = ESC/POS codepage bytes; image = Pillow bitmap (avoids Chinese firmware codepage bugs).
    # Default image: Cyrillic-safe on XP-80C Chinese firmware (build-pos / qurilish mollari).
    receipt_render_mode = models.CharField(
        max_length=8,
        choices=ReceiptRenderMode.choices,
        default=ReceiptRenderMode.IMAGE,
        help_text="How receipt body is sent: RAW text or bitmap image",
    )
    # Master switch: when False, POS never prints receipts and receipt printer UI is hidden.
    receipt_printing_enabled = models.BooleanField(
        default=False,
        help_text="Enable receipt printing after sales (disable if store has no receipt printer)",
    )
    auto_print_on_sale = models.BooleanField(default=True)
    scanner_mode = models.CharField(max_length=16, default="keyboard")
    scanner_prefix = models.CharField(max_length=16, blank=True, default="")
    scanner_suffix = models.CharField(max_length=16, blank=True, default="\t")
    lock_timeout_minutes = models.PositiveSmallIntegerField(default=5)
    
    # Inventory & Pricing Configuration
    low_stock_threshold = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        default=Decimal("2"),
        help_text="Minimum stock (kg or pieces) before product is considered low stock",
    )
    show_price_on_labels_default = models.BooleanField(default=True, help_text="Whether to display price on printed labels by default")
    show_selling_price_in_catalog = models.BooleanField(default=True, help_text="Whether to display selling price in catalog and POS")

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Store settings"
        verbose_name_plural = "Store settings"

    def __str__(self):
        return self.brand_name

    @classmethod
    def get_solo(cls):
        obj = cls.objects.order_by("updated_at").first()
        if obj:
            return obj
        return cls.objects.create(brand_name="Hansoft POS")
