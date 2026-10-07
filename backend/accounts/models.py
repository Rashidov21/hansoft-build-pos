import uuid

from django.conf import settings
from django.db import models


class Role(models.TextChoices):
    CASHIER = "CASHIER", "Cashier"
    OWNER = "OWNER", "Owner"
    ADMIN = "ADMIN", "Admin"


class UserProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.CASHIER)
    pin_hash = models.CharField(max_length=255, blank=True, default="")
    pin_enabled = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user.username} ({self.role})"
