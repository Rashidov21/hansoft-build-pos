import pytest
from django.test import override_settings

from licensing import remote_client


@pytest.mark.django_db
def test_license_api_base_bare_host_gets_https():
    with override_settings(LICENSE_API_BASE_URL="api.geeks.uz"):
        assert remote_client._license_api_base_configuration_error() is None
        assert remote_client._base_url() == "https://api.geeks.uz/"


@pytest.mark.django_db
def test_license_api_base_path_only_is_rejected():
    with override_settings(LICENSE_API_BASE_URL="/api/v1/admin/licenses/"):
        err = remote_client._license_api_base_configuration_error()
        assert err is not None
        assert "path" in err.lower() or "host" in err.lower()


@pytest.mark.django_db
def test_license_api_base_explicit_https_unchanged():
    with override_settings(LICENSE_API_BASE_URL="https://api.geeks.uz/api/v1"):
        assert remote_client._license_api_base_configuration_error() is None
        assert remote_client._base_url() == "https://api.geeks.uz/api/v1/"
