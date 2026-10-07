"""Build-materials unit validation (dona / kg / m / qop)."""

from decimal import Decimal

import pytest

from core.qty import (
    UNIT_DONA,
    UNIT_KG,
    UNIT_M,
    UNIT_QOP,
    normalize_unit,
    parse_qty,
    validate_sale_qty,
    validate_stock_qty,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("dona", UNIT_DONA),
        ("KG", UNIT_KG),
        ("m", UNIT_M),
        ("qop", UNIT_QOP),
    ],
)
def test_normalize_unit(raw, expected):
    assert normalize_unit(raw) == expected


def test_normalize_unit_unknown():
    with pytest.raises(ValueError, match="Unknown unit"):
        normalize_unit("litr")


@pytest.mark.parametrize(
    "qty,unit",
    [
        (Decimal("1"), UNIT_DONA),
        (Decimal("3"), UNIT_QOP),
        (Decimal("0.001"), UNIT_KG),
        (Decimal("0.5"), UNIT_M),
        (Decimal("12.5"), UNIT_KG),
    ],
)
def test_validate_sale_qty_ok(qty, unit):
    validate_sale_qty(qty, unit)


@pytest.mark.parametrize(
    "qty,unit",
    [
        (Decimal("0"), UNIT_DONA),
        (Decimal("0.5"), UNIT_DONA),
        (Decimal("1.5"), UNIT_QOP),
        (Decimal("0"), UNIT_KG),
        (Decimal("0.0004"), UNIT_M),
    ],
)
def test_validate_sale_qty_bad(qty, unit):
    with pytest.raises(ValueError):
        validate_sale_qty(qty, unit)


def test_no_honey_min_kg_floor():
    """0.05 kg must be allowed (construction; honey 0.1 kg floor removed)."""
    validate_sale_qty(Decimal("0.05"), UNIT_KG)


def test_validate_stock_qty_integer():
    validate_stock_qty(Decimal("10"), UNIT_QOP)
    with pytest.raises(ValueError):
        validate_stock_qty(Decimal("1.5"), UNIT_DONA)


def test_parse_qty():
    assert parse_qty("1.2345") == Decimal("1.235")
