"""Quantity helpers for kg / dona retail (honey shop)."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

QTY_QUANT = Decimal("0.001")
MIN_KG_SALE = Decimal("0.100")

UNIT_KG = "kg"
UNIT_DONA = "dona"
UNIT_CHOICES = (
    (UNIT_KG, "kg"),
    (UNIT_DONA, "dona"),
)


def parse_qty(value) -> Decimal:
    """Normalize quantity to 3 decimal places."""
    try:
        q = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as ex:
        raise ValueError("Invalid quantity") from ex
    return q.quantize(QTY_QUANT, rounding=ROUND_HALF_UP)


def validate_sale_qty(qty: Decimal, unit: str) -> None:
    """Validate sale/return qty for product unit."""
    if qty <= 0:
        raise ValueError("Invalid qty")
    u = (unit or UNIT_KG).strip().lower()
    if u == UNIT_KG:
        if qty < MIN_KG_SALE:
            raise ValueError("Minimum sale quantity is 0.100 kg (100g)")
    elif u == UNIT_DONA:
        if qty != qty.to_integral_value() or qty < 1:
            raise ValueError("Piece quantity must be a whole number >= 1")
    else:
        raise ValueError(f"Unknown unit: {unit}")


def validate_stock_qty(qty: Decimal, unit: str = UNIT_KG) -> None:
    """Validate receive/adjust absolute amounts (allow any positive; kg may be fractional)."""
    if qty < 0:
        raise ValueError("Quantity cannot be negative")
    u = (unit or UNIT_KG).strip().lower()
    if u == UNIT_DONA and qty != qty.to_integral_value():
        raise ValueError("Piece quantity must be a whole number")
