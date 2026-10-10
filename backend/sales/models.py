import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


class Sale(models.Model):
    class Status(models.TextChoices):
        COMPLETED = "COMPLETED", "Completed"
        VOIDED = "VOIDED", "Voided"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    public_sale_no = models.CharField(max_length=32, unique=True, db_index=True, blank=True, default="")
    idempotency_key = models.CharField(max_length=64, unique=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.COMPLETED
    )
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sales",
    )
    shift = models.ForeignKey(
        "expenses.Shift",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="sales",
        help_text="Open shift at sale time (null for legacy rows).",
    )
    completed_at = models.DateTimeField(auto_now_add=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.CharField(max_length=500, blank=True)
    exported_at = models.DateTimeField(null=True, blank=True)
    export_last_error = models.TextField(blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="archived_sales",
    )

    class Meta:
        ordering = ["-completed_at"]
        indexes = [
            models.Index(fields=["completed_at"]),
            models.Index(fields=["status", "-completed_at"]),
            models.Index(fields=["shift", "-completed_at"]),
        ]


class SaleLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="lines")
    variant = models.ForeignKey(
        "catalog.ProductVariant", on_delete=models.PROTECT, related_name="sale_lines"
    )
    qty = models.DecimalField(max_digits=12, decimal_places=3)
    list_unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    line_discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    purchase_unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    line_total = models.DecimalField(max_digits=12, decimal_places=2)
    is_bonus = models.BooleanField(default=False, db_index=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(qty__gt=0), name="saleline_qty_positive"
            ),
        ]


class CardBank(models.TextChoices):
    MBANK = "MBANK", "MBank"
    BAKAI = "BAKAI", "Bakai"
    ZERO = "ZERO", "Zero"
    EKO_ISLAMIC = "EKO_ISLAMIC", "Eko Islamic"


class Payment(models.Model):
    class Method(models.TextChoices):
        CASH = "CASH", "Cash"
        CARD = "CARD", "Card"
        DEBT = "DEBT", "Debt"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="payments")
    method = models.CharField(max_length=16, choices=Method.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    card_bank = models.CharField(
        max_length=16,
        choices=CardBank.choices,
        blank=True,
        default="",
        help_text="Required when method=CARD",
    )


class SaleRefund(models.Model):
    """Pul qaytarish: vozvrat operatsiyasida kassadan chiqim / qarz kamaytirish."""

    class Method(models.TextChoices):
        CASH = "CASH", "Cash"
        CARD = "CARD", "Card"
        DEBT = "DEBT", "Debt"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="refunds")
    method = models.CharField(max_length=16, choices=Method.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    card_bank = models.CharField(
        max_length=16,
        choices=CardBank.choices,
        blank=True,
        default="",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sale_refunds",
    )
    reason = models.CharField(max_length=500, blank=True, default="")
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reversed_sale_refunds",
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["sale", "created_at"]),
            models.Index(fields=["method", "created_at"]),
        ]
