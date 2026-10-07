import pytest
from django.utils import timezone

from integrations.models import IntegrationSettings, NotificationQueue, ReportChannel, ReportRoute
from integrations.report_routing import ensure_channels_from_legacy, resolve_channels
from integrations.services import send_low_stock_report, send_z_report_multichannel


@pytest.mark.django_db
def test_ensure_channels_from_legacy_creates_owner_and_routes():
    settings = IntegrationSettings.get_solo()
    settings.telegram_chat_id = "111"
    settings.whatsapp_sender = "998901112233"
    settings.primary_report_channel = "both"
    settings.save()

    ensure_channels_from_legacy()

    assert ReportChannel.objects.filter(kind="telegram", address="111").exists()
    assert ReportChannel.objects.filter(kind="whatsapp", address="998901112233").exists()
    z = resolve_channels(ReportRoute.ReportType.DAILY_Z)
    assert len(z) == 2
    backup = resolve_channels(ReportRoute.ReportType.DB_BACKUP)
    assert len(backup) == 1
    assert backup[0].kind == "telegram"


@pytest.mark.django_db
def test_z_report_routes_to_specific_telegram_chat(monkeypatch):
    ReportChannel.objects.all().delete()
    ReportRoute.objects.all().delete()
    owner = ReportChannel.objects.create(
        name="Egasi", kind=ReportChannel.Kind.TELEGRAM, address="owner-chat", is_active=True
    )
    staff = ReportChannel.objects.create(
        name="Xodim", kind=ReportChannel.Kind.TELEGRAM, address="staff-chat", is_active=True
    )
    z = ReportRoute.objects.create(report_type=ReportRoute.ReportType.DAILY_Z, enabled=True)
    z.channels.set([owner])
    low = ReportRoute.objects.create(report_type=ReportRoute.ReportType.LOW_STOCK, enabled=True)
    low.channels.set([staff])
    ReportRoute.objects.create(report_type=ReportRoute.ReportType.DB_BACKUP, enabled=True)

    settings = IntegrationSettings.get_solo()
    settings.telegram_bot_token = "tok"
    settings.telegram_chat_id = "owner-chat"
    settings.save()

    captured = []

    def _fake_tg(*, settings, chat_id, text):
        captured.append(chat_id)
        return "ok"

    monkeypatch.setattr("integrations.services._send_telegram_text_to", _fake_tg)
    out = send_z_report_multichannel(
        lang="uz", from_date=str(timezone.localdate()), to_date=str(timezone.localdate())
    )
    assert out["ok"] is True
    assert captured == ["owner-chat"]


@pytest.mark.django_db
def test_low_stock_routes_to_staff_only(monkeypatch):
    ReportChannel.objects.all().delete()
    ReportRoute.objects.all().delete()
    owner = ReportChannel.objects.create(
        name="Egasi", kind=ReportChannel.Kind.TELEGRAM, address="owner-chat", is_active=True
    )
    staff = ReportChannel.objects.create(
        name="Xodim", kind=ReportChannel.Kind.TELEGRAM, address="staff-chat", is_active=True
    )
    z = ReportRoute.objects.create(report_type=ReportRoute.ReportType.DAILY_Z, enabled=True)
    z.channels.set([owner])
    low = ReportRoute.objects.create(report_type=ReportRoute.ReportType.LOW_STOCK, enabled=True)
    low.channels.set([staff])
    ReportRoute.objects.create(report_type=ReportRoute.ReportType.DB_BACKUP, enabled=True)

    settings = IntegrationSettings.get_solo()
    settings.telegram_bot_token = "tok"
    settings.save()

    monkeypatch.setattr("integrations.services._build_low_stock_report_text", lambda **_: "low stock")
    captured = []

    def _fake_tg(*, settings, chat_id, text):
        captured.append({"chat_id": chat_id, "text": text})
        return "ok"

    monkeypatch.setattr("integrations.services._send_telegram_text_to", _fake_tg)
    out = send_low_stock_report(lang="uz")
    assert out["ok"] is True
    assert len(captured) == 1
    assert captured[0]["chat_id"] == "staff-chat"


@pytest.mark.django_db
def test_legacy_whatsapp_zreport_still_works_without_saved_channels(monkeypatch):
    ReportChannel.objects.all().delete()
    # Keep empty routes from migration / ensure_default
    ReportRoute.objects.all().delete()
    for rt, _ in ReportRoute.ReportType.choices:
        ReportRoute.objects.create(report_type=rt, enabled=True)

    settings = IntegrationSettings.get_solo()
    settings.telegram_bot_token = ""
    settings.telegram_chat_id = ""
    settings.whatsapp_provider = IntegrationSettings.WhatsAppProvider.GREEN_API
    settings.whatsapp_api_base = "https://example.org"
    settings.whatsapp_sender = "998901112233"
    settings.greenapi_instance_id = "123"
    settings.greenapi_api_token_instance = "tok"
    settings.save()

    captured = {}

    def _fake_post(url, payload, headers=None):
        captured["payload"] = payload
        return True, "ok"

    monkeypatch.setattr("integrations.services._post_json", _fake_post)
    out = send_z_report_multichannel(
        lang="uz", from_date=str(timezone.localdate()), to_date=str(timezone.localdate())
    )
    assert out["ok"] is True
    assert "998901112233" in str(captured["payload"].get("chatId") or "")


@pytest.mark.django_db
def test_queue_payload_includes_chat_id(monkeypatch):
    ReportChannel.objects.all().delete()
    ReportRoute.objects.all().delete()
    ch = ReportChannel.objects.create(
        name="Egasi", kind=ReportChannel.Kind.TELEGRAM, address="retry-chat", is_active=True
    )
    z = ReportRoute.objects.create(report_type=ReportRoute.ReportType.DAILY_Z, enabled=True)
    z.channels.set([ch])
    ReportRoute.objects.create(report_type=ReportRoute.ReportType.LOW_STOCK, enabled=True)
    ReportRoute.objects.create(report_type=ReportRoute.ReportType.DB_BACKUP, enabled=True)

    settings = IntegrationSettings.get_solo()
    settings.telegram_bot_token = "tok"
    settings.save()

    from integrations.services import NotificationDeliveryError

    def _fail(*, settings, chat_id, text):
        raise NotificationDeliveryError("HTTP 500", retriable=True)

    monkeypatch.setattr("integrations.services._send_telegram_text_to", _fail)
    out = send_z_report_multichannel(
        lang="uz", from_date=str(timezone.localdate()), to_date=str(timezone.localdate())
    )
    assert out["ok"] is True
    row = NotificationQueue.objects.filter(kind=NotificationQueue.Kind.Z_REPORT_TELEGRAM).first()
    assert row is not None
    assert row.payload.get("chat_id") == "retry-chat"
