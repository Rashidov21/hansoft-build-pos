"""Shared pytest fixtures for Hansoft build POS backend tests."""

from __future__ import annotations

import pytest


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "no_auto_shift: do not auto-create OPEN shift for complete_sale (J6 negative tests)",
    )


@pytest.fixture(autouse=True)
def _auto_open_shift_for_complete_sale(request, db, monkeypatch):
    """
    Most sale tests never opened a Shift; J6 now requires one.
    Auto-create OPEN shift unless test is marked @pytest.mark.no_auto_shift.
    """
    if request.node.get_closest_marker("no_auto_shift"):
        yield
        return

    from expenses.models import Shift
    from sales import services as sales_services

    original = sales_services._complete_sale_inner

    def _wrapped(**kwargs):
        cashier = kwargs.get("cashier")
        if cashier is not None and not Shift.objects.filter(
            cashier=cashier, status=Shift.Status.OPEN
        ).exists():
            Shift.objects.create(cashier=cashier, status=Shift.Status.OPEN)
        return original(**kwargs)

    monkeypatch.setattr(sales_services, "_complete_sale_inner", _wrapped)
    yield
