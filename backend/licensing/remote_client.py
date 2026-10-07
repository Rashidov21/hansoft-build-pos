"""HTTP client for Owner Dashboard licensing contract."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlencode, urljoin, urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


def _normalize_license_api_base_url(raw: str | None) -> tuple[str, str | None]:
    """
    Build an absolute base URL for urllib (scheme + host required).

    Misconfigured examples that would cause ValueError / "unknown url type":
    - ``/api/v1/...`` (path only, no host)
    - ``api.example.com`` (missing scheme — we prepend https://)
    """
    s = (raw or "").strip()
    if not s:
        return "", None
    if s.startswith("//"):
        s = "https:" + s
    elif not s.startswith(("http://", "https://")):
        if s.startswith("/"):
            return "", (
                "LICENSE_API_BASE_URL must be a full URL with host, not a path only "
                "(e.g. set https://api.geeks.uz instead of /api/v1/...)."
            )
        s = "https://" + s.lstrip("/")
    parsed = urlparse(s)
    if parsed.scheme not in ("http", "https"):
        return "", "LICENSE_API_BASE_URL must use http:// or https://."
    if not parsed.netloc:
        return "", "LICENSE_API_BASE_URL must include a hostname (e.g. https://api.geeks.uz)."
    return s.rstrip("/") + "/", None


def _license_api_base_configuration_error() -> str | None:
    raw = (getattr(settings, "LICENSE_API_BASE_URL", None) or "").strip()
    if not raw:
        return None
    base, err = _normalize_license_api_base_url(raw)
    if base:
        return None
    return err or "LICENSE_API_BASE_URL is invalid."


def _base_url() -> str:
    raw = getattr(settings, "LICENSE_API_BASE_URL", None) or ""
    base, _ = _normalize_license_api_base_url(raw)
    return base


def _headers(*, include_json: bool = True) -> dict[str, str]:
    headers: dict[str, str] = {}
    if include_json:
        headers["Content-Type"] = "application/json"
    token = (getattr(settings, "LICENSE_AUTH_TOKEN", None) or "").strip()
    client_key = (getattr(settings, "LICENSE_CLIENT_API_KEY", None) or "").strip()
    if token:
        headers["Authorization"] = f"Token {token}"
    if client_key:
        headers["X-CLIENT-KEY"] = client_key
    return headers


def _decode_json_body(raw: bytes) -> tuple[bool, dict[str, Any] | str]:
    try:
        body = (raw or b"").decode("utf-8")
        data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        return False, "Invalid JSON from license server"
    if not isinstance(data, dict):
        return False, "License server returned non-object JSON"
    return True, data


ADMIN_LICENSES_PAGE_LIMIT = 1000


def remote_fetch_admin_licenses_list() -> tuple[bool, list[dict[str, Any]] | str, int]:
    """
    GET /api/v1/admin/licenses/?limit=1000&offset=0 (and follow ``next``).

    Not used by the POS activation flow (verify + activate). Reserved for owner/admin tooling
    or server-side scripts that need the full license list.
    """
    cfg_err = _license_api_base_configuration_error()
    if cfg_err:
        return False, cfg_err, 0
    base = _base_url()
    if not base:
        return False, "LICENSE_API_BASE_URL is not configured", 0
    query = urlencode({"limit": ADMIN_LICENSES_PAGE_LIMIT, "offset": 0})
    url: str | None = urljoin(base, f"api/v1/admin/licenses/?{query}")
    aggregated: list[dict[str, Any]] = []
    pages = 0
    max_pages = 200
    while url:
        pages += 1
        if pages > max_pages:
            return False, "License server admin list pagination exceeded safe limit", 502
        req = Request(url, method="GET")
        for k, v in _headers(include_json=False).items():
            req.add_header(k, v)
        try:
            with urlopen(req, timeout=30) as resp:
                status = int(getattr(resp, "status", 200) or 200)
                ok, data = _decode_json_body(resp.read() or b"")
                if not ok:
                    return False, data if isinstance(data, str) else "Invalid JSON from license server", status
                if not isinstance(data, dict):
                    return False, "License server returned non-object JSON", status
                results = data.get("results")
                if not isinstance(results, list):
                    return False, "Invalid license server payload (results)", status
                aggregated.extend([r for r in results if isinstance(r, dict)])
                nxt = data.get("next")
                if nxt and isinstance(nxt, str) and nxt.strip():
                    nxt = nxt.strip()
                    if nxt.startswith("http://") or nxt.startswith("https://"):
                        url = nxt
                    else:
                        url = urljoin(base, nxt.lstrip("/"))
                    base_host = urlparse(base).netloc
                    if urlparse(url).netloc and urlparse(url).netloc != base_host:
                        return False, "License server returned unexpected next URL", status
                else:
                    url = None
        except HTTPError as e:
            dec_ok, data = _decode_json_body(e.read() or b"")
            if dec_ok and isinstance(data, dict):
                return False, data, int(e.code)
            return False, f"HTTP {e.code}", int(e.code)
        except URLError as e:
            return False, str(e.reason or e), 0
        except OSError as e:
            return False, str(e), 0
        except ValueError as e:
            return False, str(e), 0
    return True, aggregated, 200


def remote_verify_activation_key(*, activation_key: str) -> tuple[bool, dict[str, Any] | str, int]:
    """
    POST /api/v1/verify-activation-key/ — key exists, status, hardware_bound (POS step 1).

    Body: ``{"activation_key": "<key>"}``. Same auth headers as other license calls.
    """
    cfg_err = _license_api_base_configuration_error()
    if cfg_err:
        return False, cfg_err, 0
    base = _base_url()
    if not base:
        return False, "LICENSE_API_BASE_URL is not configured", 0
    url = urljoin(base, "api/v1/verify-activation-key/")
    payload = {"activation_key": activation_key}
    req = Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    for k, v in _headers(include_json=True).items():
        req.add_header(k, v)
    try:
        with urlopen(req, timeout=20) as resp:
            status = int(getattr(resp, "status", 200) or 200)
            ok, data = _decode_json_body(resp.read() or b"")
            return ok, data, status
    except HTTPError as e:
        ok, data = _decode_json_body(e.read() or b"")
        return ok, data if ok else f"HTTP {e.code}", int(e.code)
    except URLError as e:
        return False, str(e.reason or e), 0
    except OSError as e:
        return False, str(e), 0
    except ValueError as e:
        return False, str(e), 0


def remote_activate(
    *, activation_key: str, hardware_id: str, client_meta: dict[str, Any] | None = None
) -> tuple[bool, dict[str, Any] | str, int]:
    """
    POST /api/v1/activate/ — bind hardware_id and confirm activation (POS step 2).
    """
    cfg_err = _license_api_base_configuration_error()
    if cfg_err:
        return False, cfg_err, 0
    base = _base_url()
    if not base:
        return False, "LICENSE_API_BASE_URL is not configured", 0
    url = urljoin(base, "api/v1/activate/")
    payload = {
        "activation_key": activation_key,
        "hardware_id": hardware_id,
        "client_meta": client_meta or {},
    }
    req = Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    for k, v in _headers(include_json=True).items():
        req.add_header(k, v)
    try:
        with urlopen(req, timeout=20) as resp:
            status = int(getattr(resp, "status", 200) or 200)
            ok, data = _decode_json_body(resp.read() or b"")
            return ok, data, status
    except HTTPError as e:
        ok, data = _decode_json_body(e.read() or b"")
        return ok, data if ok else f"HTTP {e.code}", int(e.code)
    except URLError as e:
        return False, str(e.reason or e), 0
    except OSError as e:
        return False, str(e), 0
    except ValueError as e:
        return False, str(e), 0


def remote_check_status(*, activation_key: str, hardware_id: str) -> tuple[bool, dict[str, Any] | str, int]:
    cfg_err = _license_api_base_configuration_error()
    if cfg_err:
        return False, cfg_err, 0
    base = _base_url()
    if not base:
        return False, "LICENSE_API_BASE_URL is not configured", 0
    query = urlencode({"activation_key": activation_key, "hardware_id": hardware_id})
    url = urljoin(base, "api/v1/check-status/") + f"?{query}"
    req = Request(url, method="GET")
    for k, v in _headers(include_json=False).items():
        req.add_header(k, v)
    try:
        with urlopen(req, timeout=20) as resp:
            status = int(getattr(resp, "status", 200) or 200)
            ok, data = _decode_json_body(resp.read() or b"")
            return ok, data, status
    except HTTPError as e:
        ok, data = _decode_json_body(e.read() or b"")
        return ok, data if ok else f"HTTP {e.code}", int(e.code)
    except URLError as e:
        return False, str(e.reason or e), 0
    except OSError as e:
        return False, str(e), 0
    except ValueError as e:
        return False, str(e), 0


def remote_sync_report(
    *, activation_key: str, hardware_id: str, events: list[dict[str, Any]]
) -> tuple[bool, dict[str, Any] | str, int]:
    cfg_err = _license_api_base_configuration_error()
    if cfg_err:
        return False, cfg_err, 0
    base = _base_url()
    if not base:
        return False, "LICENSE_API_BASE_URL is not configured", 0
    url = urljoin(base, "api/v1/sync-report/")
    payload = {
        "activation_key": activation_key,
        "hardware_id": hardware_id,
        "events": events,
    }
    req = Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    for k, v in _headers(include_json=True).items():
        req.add_header(k, v)
    try:
        with urlopen(req, timeout=20) as resp:
            status = int(getattr(resp, "status", 200) or 200)
            ok, data = _decode_json_body(resp.read() or b"")
            return ok, data, status
    except HTTPError as e:
        ok, data = _decode_json_body(e.read() or b"")
        return ok, data if ok else f"HTTP {e.code}", int(e.code)
    except URLError as e:
        return False, str(e.reason or e), 0
    except OSError as e:
        return False, str(e), 0
    except ValueError as e:
        return False, str(e), 0
