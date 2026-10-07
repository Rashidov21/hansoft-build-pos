import uuid

from django.conf import settings
from django.db import models


class Customer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    phone_normalized = models.CharField(max_length=32, unique=True)
    note = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["phone_normalized"]),
        ]


class Debt(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        PAID = "PAID", "Paid"
        VOIDED = "VOIDED", "Voided"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        Customer, on_delete=models.PROTECT, related_name="debts"
    )
    originating_sale = models.OneToOneField(
        "sales.Sale",
        on_delete=models.PROTECT,
        related_name="debt_record",
    )
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    remaining_amount = models.DecimalField(max_digits=12, decimal_places=2)
    due_date = models.DateField(null=True, blank=True)
    # Bo'lib to'lash: jami summa N oyga bo'linadi
    installment_months = models.PositiveIntegerField(null=True, blank=True)
    monthly_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.OPEN
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["customer", "status", "due_date"]),
        ]


class DebtPayment(models.Model):
    """Qarzning bir qismini yoki to‘liq so‘ndirish — har bir to‘lov alohida tarix yozuvi."""

    class Method(models.TextChoices):
        CASH = "CASH", "Cash"
        CARD = "CARD", "Card"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        Customer, on_delete=models.PROTECT, related_name="payments"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(
        max_length=16, choices=Method.choices, default=Method.CASH
    )
    card_bank = models.CharField(max_length=16, blank=True, default="")
    note = models.CharField(max_length=500, blank=True, default="")
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="debt_payments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["customer", "created_at"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["method", "created_at"]),
        ]


class DebtPaymentAllocation(models.Model):
    """Bir to‘lov qaysi ochiq qarz(lar)ga qancha taqsimlangani (FIFO)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(
        DebtPayment, on_delete=models.CASCADE, related_name="allocations"
    )
    debt = models.ForeignKey(
        Debt, on_delete=models.PROTECT, related_name="payment_allocations"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        indexes = [
            models.Index(fields=["payment"]),
            models.Index(fields=["debt"]),
        ]
