import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


class InventoryMovement(models.Model):
    class Type(models.TextChoices):
        IN = "IN", "In"
        SALE = "SALE", "Sale"
        OUT = "OUT", "Out"
        RETURN = "RETURN", "Return"
        ADJUST = "ADJUST", "Adjust"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    variant = models.ForeignKey(
        "catalog.ProductVariant",
        on_delete=models.PROTECT,
        related_name="movements",
    )
    type = models.CharField(max_length=16, choices=Type.choices)
    qty_delta = models.DecimalField(max_digits=12, decimal_places=3)
    ref_sale = models.ForeignKey(
        "sales.Sale",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="inventory_movements",
    )
    note = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reversed_inventory_movements",
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["variant", "created_at"]),
        ]


class StocktakeSession(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        APPLIED = "APPLIED", "Applied"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    note = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    applied_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="stocktake_sessions",
    )


class StocktakeLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        StocktakeSession,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    variant = models.ForeignKey(
        "catalog.ProductVariant",
        on_delete=models.PROTECT,
        related_name="stocktake_lines",
    )
    expected_qty = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0"))
    counted_qty = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    variance_qty = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0"))

    class Meta:
        unique_together = ("session", "variant")
