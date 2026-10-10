import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models

from core.qty import UNIT_CHOICES, UNIT_DONA


def _fill_bilingual_names(instance, *, has_cyrillic: bool = False) -> None:
    """Copy name_uz into empty name_ru / cyrillic so owners enter one name."""
    uz = (getattr(instance, "name_uz", None) or "").strip()
    if not uz:
        return
    if not (getattr(instance, "name_ru", None) or "").strip():
        instance.name_ru = uz
    if has_cyrillic and not (getattr(instance, "name_uz_cyrillic", None) or "").strip():
        instance.name_uz_cyrillic = uz
    custom_uz = (getattr(instance, "custom_name_uz", None) or "").strip()
    if custom_uz:
        if hasattr(instance, "custom_name_ru") and not (getattr(instance, "custom_name_ru", None) or "").strip():
            instance.custom_name_ru = custom_uz
        if has_cyrillic and hasattr(instance, "custom_name_uz_cyrillic"):
            if not (getattr(instance, "custom_name_uz_cyrillic", None) or "").strip():
                instance.custom_name_uz_cyrillic = custom_uz


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name_uz = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255)
    sort_order = models.PositiveIntegerField(default=0)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name_plural = "categories"
        ordering = ["sort_order", "name_uz"]

    def save(self, *args, **kwargs):
        _fill_bilingual_names(self)
        super().save(*args, **kwargs)


class ProductCategory(models.Model):
    """Product line e.g. Asal, Ari mahsulotlari."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name_uz = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255)
    sort_order = models.PositiveIntegerField(default=0)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "product categories"
        ordering = ["sort_order", "name_uz"]

    def __str__(self):
        return self.name_uz

    def save(self, *args, **kwargs):
        _fill_bilingual_names(self)
        super().save(*args, **kwargs)


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        Category, on_delete=models.PROTECT, related_name="products"
    )
    product_category = models.ForeignKey(
        ProductCategory, on_delete=models.SET_NULL, related_name="products", null=True, blank=True
    )
    name_uz = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255)
    name_uz_cyrillic = models.CharField(max_length=255, null=True, blank=True)
    custom_name_uz = models.CharField(max_length=255, null=True, blank=True)
    custom_name_ru = models.CharField(max_length=255, null=True, blank=True)
    custom_name_uz_cyrillic = models.CharField(max_length=255, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name_uz"]

    def save(self, *args, **kwargs):
        _fill_bilingual_names(self, has_cyrillic=True)
        super().save(*args, **kwargs)


class ProductVariant(models.Model):
    """
    Sellable SKU for build-materials retail.
    Prices are per unit (sum/dona, sum/kg, sum/m, sum/qop). stock_qty is in the same unit.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="variants"
    )
    barcode = models.CharField(max_length=64, null=True, blank=True, unique=True)
    unit = models.CharField(
        max_length=8,
        choices=UNIT_CHOICES,
        default=UNIT_DONA,
        help_text="dona|qop = whole pieces; kg|m = fractional",
    )
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2)
    list_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    # Optional wholesale (ulgurji) sell price; retail remains list_price.
    wholesale_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    stock_qty = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0"))
    show_price_on_label = models.BooleanField(default=True)
    hide_selling_price = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(stock_qty__gte=0),
                name="variant_stock_non_negative",
            ),
        ]
        indexes = [
            models.Index(fields=["product", "is_active"]),
            models.Index(fields=["barcode"]),
            models.Index(fields=["stock_qty"]),
        ]

    def __str__(self):
        return f"{self.product.name_uz} ({self.unit})"

    def save(self, *args, **kwargs):
        if self.pk is None:
            self.pk = uuid.uuid4()
        # Blank barcode → None; bulk create may auto-allocate a unique code after save.
        if self.barcode is not None and not str(self.barcode).strip():
            self.barcode = None
        super().save(*args, **kwargs)


class Supplier(models.Model):
    """Supplier/Provider information for accounts payable tracking."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name_uz = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255)
    contact_person = models.CharField(max_length=255, null=True, blank=True)
    phone = models.CharField(max_length=20, null=True, blank=True)
    email = models.EmailField(null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name_uz"]

    def __str__(self):
        return self.name_uz


class SupplierTransaction(models.Model):
    """Track supplier debt and credit transactions for accountability."""
    class Type(models.TextChoices):
        PURCHASE = "PURCHASE", "Purchase (Debt)"
        PAYMENT = "PAYMENT", "Payment (Reduces Debt)"
        RETURN = "RETURN", "Return (Credit)"
        CREDIT_MEMO = "CREDIT_MEMO", "Credit Memo"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supplier = models.ForeignKey(
        Supplier, on_delete=models.PROTECT, related_name="transactions"
    )
    type = models.CharField(max_length=16, choices=Type.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    description_uz = models.CharField(max_length=500, blank=True)
    description_ru = models.CharField(max_length=500, blank=True)
    note = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="supplier_transactions"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="voided_supplier_transactions",
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["supplier", "-created_at"]),
            models.Index(fields=["type", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.supplier.name_uz} - {self.get_type_display()} - {self.amount}"


class ProductSpecification(models.Model):
    """Legacy appliance specs (unused in honey UI)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.OneToOneField(
        Product, on_delete=models.CASCADE, related_name="specifications"
    )
    capacity = models.CharField(max_length=100, blank=True, help_text="e.g., 330L, 7kg")
    power_consumption = models.CharField(max_length=100, blank=True, help_text="e.g., 150W, 2.5kW")
    voltage = models.CharField(max_length=50, blank=True, help_text="e.g., 220V, 110-240V")
    dimensions = models.CharField(max_length=100, blank=True, help_text="e.g., 60x65x185cm")
    weight = models.CharField(max_length=50, blank=True, help_text="e.g., 65kg")
    color_options = models.CharField(max_length=200, blank=True, help_text="e.g., White, Silver, Black")
    energy_class = models.CharField(max_length=20, blank=True, help_text="e.g., A++, A+, B")
    additional_specs = models.JSONField(default=dict, blank=True, help_text="Additional specifications as key-value pairs")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Product Specification"
        verbose_name_plural = "Product Specifications"

    def __str__(self):
        return f"Specs for {self.product.name_uz}"


class SupplierReceipt(models.Model):
    """Postavshikdan kelgan tovar partiyasi (katalogdagi variantlar + IMEI)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supplier = models.ForeignKey(
        Supplier, on_delete=models.PROTECT, related_name="receipts"
    )
    received_at = models.DateTimeField(auto_now_add=True)
    note = models.TextField(blank=True, default="")
    total_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="supplier_receipts",
    )
    # Avtomatik yaratilgan PURCHASE tranzaksiya (ixtiyoriy bog'lanish)
    linked_transaction = models.ForeignKey(
        SupplierTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="receipts",
    )

    class Meta:
        ordering = ["-received_at", "-id"]
        indexes = [
            models.Index(fields=["supplier", "-received_at"]),
        ]

    def __str__(self):
        return f"Receipt {self.supplier.name_uz} {self.received_at}"


class SupplierReceiptLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt = models.ForeignKey(
        SupplierReceipt, on_delete=models.CASCADE, related_name="lines"
    )
    variant = models.ForeignKey(
        ProductVariant, on_delete=models.PROTECT, related_name="supplier_receipt_lines"
    )
    qty = models.DecimalField(max_digits=12, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    line_cost = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(qty__gt=0), name="supplierreceiptline_qty_positive"
            ),
        ]
