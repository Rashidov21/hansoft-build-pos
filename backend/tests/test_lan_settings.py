"""LAN multi-kassa host settings from env."""

import importlib

import pytest


@pytest.mark.parametrize(
    "extra,expect_contains",
    [
        ("192.168.1.10", "192.168.1.10"),
        ("192.168.1.10,pos.local", "pos.local"),
    ],
)
def test_allowed_hosts_merges_env(monkeypatch, extra, expect_contains):
    monkeypatch.setenv("DJANGO_ALLOWED_HOSTS", extra)
    import config.settings as settings_mod

    importlib.reload(settings_mod)
    assert "127.0.0.1" in settings_mod.ALLOWED_HOSTS
    assert "localhost" in settings_mod.ALLOWED_HOSTS
    assert expect_contains in settings_mod.ALLOWED_HOSTS
    # Avoid leaving polluted module for other tests
    monkeypatch.delenv("DJANGO_ALLOWED_HOSTS", raising=False)
    importlib.reload(settings_mod)
