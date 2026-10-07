from decimal import Decimal
from typing import Any

from django.db import transaction

from core.qty import UNIT_KG, parse_qty
from inventory.models import InventoryMovement
from inventory.services import apply_movement
from .models import Product, ProductVariant


@transaction.atomic
def bulk_create_variant_grid(
    product: Product,
    matrix: list[dict[str, Any]],
    user,
) -> list[ProductVariant]:
    """
    Create honey/bee-product SKUs.
    matrix items: purchase_price, list_price (optional), initial_qty, barcode,
    unit (optional, default kg).
    """
    created: list[ProductVariant] = []
    for cell in matrix:
        qty = parse_qty(cell.get("initial_qty") or 0)
        barcode = cell.get("barcode") or None
        unit = (cell.get("unit") or UNIT_KG).strip().lower() or UNIT_KG

        raw_list = cell.get("list_price")
        list_price = Decimal(str(raw_list)) if raw_list is not None and str(raw_list) != "" else None

        v = ProductVariant(
            product=product,
            purchase_price=Decimal(str(cell["purchase_price"])),
            list_price=list_price,
            stock_qty=Decimal("0"),
            barcode=barcode,
            unit=unit,
        )
        v.save()
        if qty > 0:
            apply_movement(
                variant=v,
                qty_delta=qty,
                movement_type=InventoryMovement.Type.IN,
                user=user,
                note="Initial stock from grid",
            )
        created.append(v)
    return created
