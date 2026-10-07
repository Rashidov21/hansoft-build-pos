import uuid

from django.db import models


class LicenseState(models.Model):
    """Singleton: local license material for offline-first POS."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hardware_id = models.CharField(max_length=128, blank=True, default="")
    license_key = models.CharField(max_length=255, blank=True, default="")
    expiry_ciphertext = models.BinaryField(null=True, blank=True)
    demo_started_at = models.DateTimeField(null=True, blank=True)
    last_check_at = models.DateTimeField(null=True, blank=True)
    last_check_ok = models.BooleanField(default=False)
    last_check_message = models.CharField(max_length=500, blank=True, default="")
    last_valid_remote_at = models.DateTimeField(null=True, blank=True)
    raw_status_json = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "License state"

    def __str__(self):
        return f"LicenseState({self.hardware_id[:8] if self.hardware_id else '—'}…)"

    @classmethod
    def get_solo(cls):
        obj = cls.objects.order_by("-updated_at").first()
        if obj:
            return obj
        return cls.objects.create()
