import pytest
from django.contrib.auth.hashers import check_password
from django.contrib.auth.models import User

from accounts.bootstrap import ensure_default_users_and_pins


@pytest.mark.django_db
def test_bootstrap_creates_default_admin_and_cashier_with_pin():
    ensure_default_users_and_pins()

    admin = User.objects.select_related("profile").get(username="admin")
    cashier = User.objects.select_related("profile").get(username="cashier")

    assert admin.profile.role == "ADMIN"
    assert cashier.profile.role == "CASHIER"
    assert admin.profile.pin_enabled is True
    assert cashier.profile.pin_enabled is True
    assert check_password("1111", admin.profile.pin_hash)
    assert check_password("1111", cashier.profile.pin_hash)


@pytest.mark.django_db
def test_bootstrap_does_not_override_existing_custom_pin():
    ensure_default_users_and_pins()
    admin = User.objects.select_related("profile").get(username="admin")
    from django.contrib.auth.hashers import make_password

    # Simulate admin changing PIN later in Settings.
    admin.profile.pin_enabled = True
    admin.profile.pin_hash = make_password("9999")
    admin.profile.save(update_fields=["pin_enabled", "pin_hash"])

    ensure_default_users_and_pins()
    admin.refresh_from_db()
    assert check_password("9999", admin.profile.pin_hash)


@pytest.mark.django_db
def test_bootstrap_upgrades_legacy_demo_pin_to_1111():
    ensure_default_users_and_pins()
    admin = User.objects.select_related("profile").get(username="admin")
    from django.contrib.auth.hashers import make_password

    admin.profile.pin_enabled = True
    admin.profile.pin_hash = make_password("1234")
    admin.profile.save(update_fields=["pin_enabled", "pin_hash"])

    ensure_default_users_and_pins()
    admin.refresh_from_db()
    assert check_password("1111", admin.profile.pin_hash)
