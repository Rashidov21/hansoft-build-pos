"""Quantity helpers for build-materials retail (dona / kg / m / qop)."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

QTY_QUANT = Decimal("0.001")
MIN_FRACTIONAL_SALE = Decimal("0.001")

UNIT_DONA = "dona"
UNIT_KG = "kg"
UNIT_M = "m"
UNIT_QOP = "qop"

UNIT_CHOICES = (
    (UNIT_DONA, "dona"),
    (UNIT_KG, "kg"),
    (UNIT_M, "m"),
    (UNIT_QOP, "qop"),
)

INTEGER_UNITS = frozenset({UNIT_DONA, UNIT_QOP})
FRACTIONAL_UNITS = frozenset({UNIT_KG, UNIT_M})
KNOWN_UNITS = frozenset({UNIT_DONA, UNIT_KG, UNIT_M, UNIT_QOP})

# Kept for older imports/tests that referenced honey min; no longer enforced as 0.1 kg.
MIN_KG_SALE = MIN_FRACTIONAL_SALE


def normalize_unit(unit: str | None) -> str:
    u = (unit or UNIT_DONA).strip().lower()
    if u not in KNOWN_UNITS:
        raise ValueError(f"Unknown unit: {unit}")
    return u


def is_integer_unit(unit: str | None) -> bool:
    return normalize_unit(unit) in INTEGER_UNITS


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
    u = normalize_unit(unit)
    if u in INTEGER_UNITS:
        if qty != qty.to_integral_value() or qty < 1:
            raise ValueError("Piece quantity must be a whole number >= 1")
    elif u in FRACTIONAL_UNITS:
        if qty < MIN_FRACTIONAL_SALE:
            raise ValueError("Minimum sale quantity is 0.001")
    else:
        raise ValueError(f"Unknown unit: {unit}")


def validate_stock_qty(qty: Decimal, unit: str = UNIT_DONA) -> None:
    """Validate receive/adjust absolute amounts (fractional units may be fractional)."""
    if qty < 0:
        raise ValueError("Quantity cannot be negative")
    u = normalize_unit(unit)
    if u in INTEGER_UNITS and qty != qty.to_integral_value():
        raise ValueError("Piece quantity must be a whole number")
