import pytest
from decimal import Decimal
from django.utils import timezone

from integrations.models import IntegrationSettings, NotificationQueue
from integrations.services import run_auto_daily_z_report_if_due, send_z_report_multichannel


@pytest.mark.django_db
def test_whatsapp_zreport_uses_whatsapp_markdown_format(monkeypatch):
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
        captured["url"] = url
        captured["payload"] = payload
        return True, "ok"

    monkeypatch.setattr("integrations.services._post_json", _fake_post)
    out = send_z_report_multichannel(lang="uz", from_date=str(timezone.localdate()), to_date=str(timezone.localdate()))
    assert out["ok"] is True
    msg = str(captured["payload"]["message"])
    assert "*Z-Report*" in msg
    assert "- *Savdo summasi:*" in msg
    assert "- *Sof tushum:*" in msg


@pytest.mark.django_db
def test_zreport_whatsapp_values_include_correct_net_and_shares(monkeypatch):
    settings = IntegrationSettings.get_solo()
    settings.telegram_bot_token = ""
    settings.telegram_chat_id = ""
    settings.whatsapp_provider = IntegrationSettings.WhatsAppProvider.GREEN_API
    settings.whatsapp_api_base = "https://example.org"
    settings.whatsapp_sender = "998901112233"
    settings.greenapi_instance_id = "123"
    settings.greenapi_api_token_instance = "tok"
    settings.save()

    monkeypatch.setattr(
        "integrations.services.sales_metrics",
        lambda **_: {
            "date": "2026-04-25",
            "sales_count": 4,
            "sales_amount": Decimal("23200"),
            "cash_total": Decimal("20200"),
            "card_total": Decimal("0"),
            "debt_total": Decimal("3000"),
            "returned_count": 1,
            "returned_total": Decimal("4000"),
            "open_debt_total": Decimal("6200"),
        })

    captured = {}

    def _fake_post(url, payload, headers=None):
        captured["payload"] = payload
        return True, "ok"

    monkeypatch.setattr("integrations.services._post_json", _fake_post)
    out = send_z_report_multichannel(lang="ru", from_date="2026-04-25", to_date="2026-04-25")
    assert out["ok"] is True
    msg = str(captured["payload"]["message"])
    assert "19 200" in msg
    assert "17%" in msg
    assert "87%" in msg


@pytest.mark.django_db
def test_whatsapp_retriable_error_goes_to_queue(monkeypatch):
    settings = IntegrationSettings.get_solo()
    settings.telegram_bot_token = ""
    settings.telegram_chat_id = ""
    settings.whatsapp_provider = IntegrationSettings.WhatsAppProvider.GREEN_API
    settings.whatsapp_api_base = "https://example.org"
    settings.whatsapp_sender = "998901112233"
    settings.greenapi_instance_id = "123"
    settings.greenapi_api_token_instance = "tok"
    settings.save()

    monkeypatch.setattr("integrations.services._post_json", lambda *a, **k: (False, "HTTP 500"))
    out = send_z_report_multichannel(lang="uz", from_date=str(timezone.localdate()), to_date=str(timezone.localdate()))
    assert out["ok"] is True
    assert NotificationQueue.objects.filter(kind=NotificationQueue.Kind.Z_REPORT_WHATSAPP).exists()


@pytest.mark.django_db
def test_whatsapp_non_retriable_error_not_queued(monkeypatch):
    settings = IntegrationSettings.get_solo()
    settings.telegram_bot_token = ""
    settings.telegram_chat_id = ""
    settings.whatsapp_provider = IntegrationSettings.WhatsAppProvider.GREEN_API
    settings.whatsapp_api_base = "https://example.org"
    settings.whatsapp_sender = "998901112233"
    settings.greenapi_instance_id = "123"
    settings.greenapi_api_token_instance = "tok"
    settings.save()

    monkeypatch.setattr("integrations.services._post_json", lambda *a, **k: (False, "HTTP 400"))
    out = send_z_report_multichannel(lang="uz", from_date=str(timezone.localdate()), to_date=str(timezone.localdate()))
    assert out["ok"] is False
    assert not NotificationQueue.objects.filter(kind=NotificationQueue.Kind.Z_REPORT_WHATSAPP).exists()


@pytest.mark.django_db
def test_auto_z_report_runs_once_per_day(monkeypatch):
    called = {"n": 0, "lang": None}

    def _fake_send_daily_z_report(*, lang="uz"):
        called["n"] += 1
        called["lang"] = lang
        return {"ok": True, "details": "ok", "channel_results": {}}

    monkeypatch.setattr("integrations.services.send_daily_z_report", _fake_send_daily_z_report)
    settings = IntegrationSettings.get_solo()
    settings.last_auto_z_report_date = None
    settings.auto_daily_z_report_enabled = True
    settings.report_lang = "ru"
    settings.save(update_fields=["last_auto_z_report_date", "auto_daily_z_report_enabled", "report_lang"])

    first = run_auto_daily_z_report_if_due(now=timezone.localtime())
    second = run_auto_daily_z_report_if_due(now=timezone.localtime())

    assert first["ran"] is True
    assert second["ran"] is False
    assert called["n"] == 1
    assert called["lang"] == "ru"


@pytest.mark.django_db
def test_auto_z_report_respects_disabled_flag(monkeypatch):
    monkeypatch.setattr(
        "integrations.services.send_daily_z_report",
        lambda **_: (_ for _ in ()).throw(AssertionError("should not send")),
    )
    settings = IntegrationSettings.get_solo()
    settings.auto_daily_z_report_enabled = False
    settings.last_auto_z_report_date = None
    settings.save(update_fields=["auto_daily_z_report_enabled", "last_auto_z_report_date"])
    out = run_auto_daily_z_report_if_due(now=timezone.localtime())
    assert out["ran"] is False
    assert out["reason"] == "disabled"


@pytest.mark.django_db
def test_auto_debt_reminder_runs_once_per_day(monkeypatch):
    called = {"n": 0}

    def _fake_send_all(*, lang="uz"):
        called["n"] += 1
        return {"ok": True, "sent": 1, "queued": 0, "failed": 0, "skipped": 0, "errors": []}

    monkeypatch.setattr(
        "integrations.debt_reminders.send_daily_debt_reminders_to_all_customers",
        _fake_send_all,
    )
    settings = IntegrationSettings.get_solo()
    settings.auto_debt_whatsapp_reminder_enabled = True
    settings.whatsapp_provider = IntegrationSettings.WhatsAppProvider.GREEN_API
    settings.whatsapp_api_base = "https://example.org"
    settings.whatsapp_sender = "998901112233"
    settings.greenapi_instance_id = "123"
    settings.greenapi_api_token_instance = "tok"
    settings.last_auto_debt_reminder_date = None
    settings.save()

    from integrations import debt_reminders as debt_reminders_mod

    class _FakeOpenQs:
        def values(self, *_args, **_kwargs):
            return self

        def distinct(self):
            return self

        def count(self):
            return 1

    monkeypatch.setattr(
        debt_reminders_mod.Debt.objects,
        "filter",
        lambda *args, **kwargs: _FakeOpenQs(),
    )

    from integrations.debt_reminders import run_auto_daily_debt_reminders_if_due

    first = run_auto_daily_debt_reminders_if_due(
        now=timezone.localtime(), require_scheduled_time=False
    )
    second = run_auto_daily_debt_reminders_if_due(
        now=timezone.localtime(), require_scheduled_time=False
    )

    assert first["ran"] is True
    assert second["ran"] is False
    assert called["n"] == 1


@pytest.mark.django_db
def test_debt_reminder_message_includes_products(monkeypatch):
    settings = IntegrationSettings.get_solo()
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

    from integrations.services import send_whatsapp_reminder

    out = send_whatsapp_reminder(
        phone="998901112233",
        customer_name="Ali",
        amount="50000",
        lang="uz",
        debt_items=[
            {
                "sale_no": "S-001",
                "total_amount": "50000",
                "remaining_amount": "50000",
                "paid_now": "0",
                "sale_time": "2026-05-30 10:00",
                "debt_created_at": "2026-05-30 10:00",
                "due_date": "2026-06-06",
                "products": [
                    {"name": "Kurtka", "qty": "2", "unit_price": "15000", "line_total": "30000"},
                ],
            }
        ],
        reminder_kind="debt_reminder",
    )
    assert out["ok"] is True
    msg = str(captured["payload"]["message"])
    assert "Mahsulotlar" in msg
    assert "Kurtka" in msg


@pytest.mark.django_db
def test_auto_debt_reminder_respects_scheduled_window(monkeypatch):
    from integrations.debt_reminders import run_auto_daily_debt_reminders_if_due

    monkeypatch.setenv("AUTO_DEBT_REMINDER_TIME", "09:00")
    settings = IntegrationSettings.get_solo()
    settings.auto_debt_whatsapp_reminder_enabled = True
    settings.whatsapp_provider = IntegrationSettings.WhatsAppProvider.GREEN_API
    settings.whatsapp_api_base = "https://example.org"
    settings.whatsapp_sender = "998901112233"
    settings.greenapi_instance_id = "123"
    settings.greenapi_api_token_instance = "tok"
    settings.last_auto_debt_reminder_date = None
    settings.save()

    early = timezone.localtime().replace(hour=8, minute=0, second=0, microsecond=0)
    out = run_auto_daily_debt_reminders_if_due(now=early, require_scheduled_time=True)
    assert out["ran"] is False
    assert out["reason"] == "before_scheduled_time"
