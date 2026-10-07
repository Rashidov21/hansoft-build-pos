"""Backend-generated barcodes: numeric 20000001+."""

from django.db.models import Max


BARCODE_START = 20000001


def _next_numeric_barcode() -> str:
    from catalog.models import ProductVariant

    max_existing = (
        ProductVariant.objects.filter(barcode__regex=r"^\d{8}$")
        .annotate()
        .aggregate(m=Max("barcode"))
        .get("m")
    )
    if not max_existing:
        return str(BARCODE_START)
    try:
        next_num = max(int(max_existing) + 1, BARCODE_START)
    except ValueError:
        next_num = BARCODE_START
    return str(next_num)


def allocate_unique_barcode(variant, max_attempts: int = 20) -> str:
    from catalog.models import ProductVariant

    for _ in range(max_attempts):
        candidate = _next_numeric_barcode()
        exists = ProductVariant.objects.exclude(pk=variant.pk).filter(barcode=candidate).exists()
        if not exists:
            return candidate
    raise RuntimeError("Could not allocate unique numeric barcode")
