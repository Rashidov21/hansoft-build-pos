import json
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings as django_settings
from django.utils import timezone

from printing.models import StoreSettings
from reports.services import sales_metrics, q_money

from .models import IntegrationSettings, NotificationQueue


class NotificationDeliveryError(ValueError):
    def __init__(self, message: str, *, retriable: bool):
        super().__init__(message)
        self.retriable = retriable


def _post_json(
    url: str,
    payload: dict,
    headers: dict[str, str] | None = None,
    *,
    require_ok_field: bool = False,
):
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if headers:
        for key, val in headers.items():
            req.add_header(key, val)
    try:
        with urlopen(req, timeout=15) as resp:  # nosec B310 - controlled admin config URL
            body = resp.read().decode("utf-8") if resp else ""
            if require_ok_field:
                try:
                    parsed = json.loads(body or "{}")
                except json.JSONDecodeError:
                    return False, "Invalid JSON response"
                if not bool(parsed.get("ok")):
                    detail = (
                        parsed.get("description")
                        or parsed.get("error")
                        or parsed.get("message")
                        or "ok=false"
                    )
                    return False, f"API ok=false: {detail}"
            return True, body
    except HTTPError as e:
        return False, f"HTTP {e.code}"
    except URLError as e:
        return False, str(e.reason)


def _norm_lang(lang: str | None) -> str:
    raw = (lang or "uz").strip().lower().replace("_", "-")
    if raw.startswith("ru"):
        return "ru"
    if raw.startswith("uz-cyrl") or raw in ("cyrl", "cyrillic"):
        return "uz-cyrl"
    return "uz"


def resolve_report_lang(*, preferred: str | None = None) -> str:
    """Prefer explicit arg → IntegrationSettings.report_lang → StoreSettings.receipt_lang → uz."""
    if preferred and str(preferred).strip():
        return _norm_lang(preferred)
    integ = IntegrationSettings.get_solo()
    if (integ.report_lang or "").strip():
        return _norm_lang(integ.report_lang)
    store = StoreSettings.get_solo()
    if (store.receipt_lang or "").strip():
        return _norm_lang(store.receipt_lang)
    return "uz"


def _fmt_money(value) -> str:
    quantized = q_money(value)
    return f"{quantized:,}".replace(",", " ")


def _fmt_pct(value) -> str:
    pct = q_money(value)
    return f"{pct}%"


def _report_derived(metrics: dict) -> dict[str, object]:
    sales_amount = q_money(metrics.get("sales_amount"))
    returned_total = q_money(metrics.get("returned_total"))
    cash_total = q_money(metrics.get("cash_total"))
    card_total = q_money(metrics.get("card_total"))
    debt_total = q_money(metrics.get("debt_total"))
    net_sales = q_money(sales_amount - returned_total)

    if sales_amount > 0:
        cash_share = q_money((cash_total * 100) / sales_amount)
        card_share = q_money((card_total * 100) / sales_amount)
        debt_share = q_money((debt_total * 100) / sales_amount)
        return_share = q_money((returned_total * 100) / sales_amount)
    else:
        cash_share = q_money(0)
        card_share = q_money(0)
        debt_share = q_money(0)
        return_share = q_money(0)

    return {
        "net_sales": net_sales,
        "cash_share": cash_share,
        "card_share": card_share,
        "debt_share": debt_share,
        "return_share": return_share,
    }


CATEGORY_LABELS = {
    "uz": {
        "RENT": "Ijara",
        "UTILITIES": "Kommunal",
        "SUPPLIES": "Materiallar / TMTs",
        "SALARY": "Maosh",
        "OTHER": "Boshqa",
    },
    "ru": {
        "RENT": "Аренда",
        "UTILITIES": "Коммунальные",
        "SUPPLIES": "Материалы / ТМЦ",
        "SALARY": "Зарплата",
        "OTHER": "Другое",
    },
    "uz-cyrl": {
        "RENT": "Ижара",
        "UTILITIES": "Коммунал",
        "SUPPLIES": "Материаллар / ТМЦ",
        "SALARY": "Маош",
        "OTHER": "Бошқа",
    },
}


def _build_expenses_block(metrics: dict, lang: str, is_whatsapp: bool = False) -> str:
    cat_map = metrics.get("today_expenses_by_category") or {}
    total = metrics.get("today_expense_total") or 0
    labels = CATEGORY_LABELS.get(lang, CATEGORY_LABELS["uz"])

    if not cat_map and not total:
        if lang == "ru":
            return "- Расходы: 0 UZS\n\n" if not is_whatsapp else "- Расходы: 0 UZS\n"
        elif lang == "uz-cyrl":
            return "- Чиқимлар: 0 UZS\n\n" if not is_whatsapp else "- Чиқимлар: 0 UZS\n"
        return "- Chiqimlar: 0 UZS\n\n" if not is_whatsapp else "- Chiqimlar: 0 UZS\n"

    lines = []
    for cat, info in cat_map.items():
        amt = info.get("amount") if isinstance(info, dict) else info
        lbl = labels.get(cat, cat)
        if is_whatsapp:
            lines.append(f"  · {lbl}: {_fmt_money(amt)}")
        else:
            lines.append(f"  · {lbl}: {_fmt_money(amt)}")

    breakdown = ("\n" + "\n".join(lines)) if lines else ""
    if lang == "ru":
        title = "Расходы"
        total_lbl = "Итого расходов"
    elif lang == "uz-cyrl":
        title = "Чиқимлар"
        total_lbl = "Жами чиқим"
    else:
        title = "Chiqimlar"
        total_lbl = "Jami chiqim"

    if is_whatsapp:
        return f"- *{title}:* {_fmt_money(total)}{breakdown}\n"
    return f"{title}:\n- {total_lbl}: {_fmt_money(total)}{breakdown}\n\n"


def _build_z_report_text(*, metrics: dict, lang: str) -> str:
    d = _report_derived(metrics)
    exp_block = _build_expenses_block(metrics, lang, is_whatsapp=False)
    gross_profit = metrics.get("today_gross_profit", metrics.get("gross_profit", 0))
    op_profit = metrics.get("today_operating_profit", metrics.get("operating_profit", 0))
    cash_flow = metrics.get("today_cash_net_flow", metrics.get("cash_total", 0))
    cash_refund = metrics.get("today_refund_cash", 0)
    exp_total = metrics.get("today_expense_total", 0)

    card_banks = "".join(
        f"  · {b.get('label', b.get('bank'))}: {_fmt_money(b.get('amount'))}\n"
        for b in (metrics.get("today_card_by_bank") or metrics.get("card_by_bank") or [])
    )

    if lang == "ru":
        return (
            f"Z-Report {metrics['date']}\n"
            f"Кратко: чистая выручка {_fmt_money(d['net_sales'])}; возвраты {_fmt_pct(d['return_share'])}\n\n"
            f"Продажи:\n"
            f"- Чеков: {metrics['sales_count']}\n"
            f"- Сумма продаж: {_fmt_money(metrics['sales_amount'])}\n\n"
            f"Оплаты:\n"
            f"- Наличные: {_fmt_money(metrics['cash_total'])} ({_fmt_pct(d['cash_share'])})\n"
            f"- Карта: {_fmt_money(metrics['card_total'])} ({_fmt_pct(d['card_share'])})\n"
            f"{card_banks}"
            f"- Долг (насия): {_fmt_money(metrics['debt_total'])} ({_fmt_pct(d['debt_share'])})\n\n"
            f"{exp_block}"
            f"Кассовый поток наличных:\n"
            f"- Поступление наличных: +{_fmt_money(metrics['cash_total'])}\n"
            f"- Возврат наличными: -{_fmt_money(cash_refund)}\n"
            f"- Расходы из кассы: -{_fmt_money(exp_total)}\n"
            f"- Чистый остаток кассы: {_fmt_money(cash_flow)}\n\n"
            f"Прибыль:\n"
            f"- Валовая прибыль: {_fmt_money(gross_profit)}\n"
            f"- Операционная чистая прибыль: {_fmt_money(op_profit)}\n\n"
            f"Возвраты и долги:\n"
            f"- Возвратов: {metrics['returned_count']} ({_fmt_money(metrics['returned_total'])})\n"
            f"- Открытый долг покупателей: {_fmt_money(metrics['open_debt_total'])}"
        )
    if lang == "uz-cyrl":
        return (
            f"Z-Report {metrics['date']}\n"
            f"Қисқа хулоса: соф тушум {_fmt_money(d['net_sales'])}; қайтиш {_fmt_pct(d['return_share'])}\n\n"
            f"Савдо:\n"
            f"- Чеклар сони: {metrics['sales_count']}\n"
            f"- Савдо суммаси: {_fmt_money(metrics['sales_amount'])}\n\n"
            f"Тўловлар:\n"
            f"- Нақд: {_fmt_money(metrics['cash_total'])} ({_fmt_pct(d['cash_share'])})\n"
            f"- Карта: {_fmt_money(metrics['card_total'])} ({_fmt_pct(d['card_share'])})\n"
            f"{card_banks}"
            f"- Насия: {_fmt_money(metrics['debt_total'])} ({_fmt_pct(d['debt_share'])})\n\n"
            f"{exp_block}"
            f"Касса нақд пул оқими:\n"
            f"- Нақд тушум: +{_fmt_money(metrics['cash_total'])}\n"
            f"- Нақд қайтиш: -{_fmt_money(cash_refund)}\n"
            f"- Касса чиқимлари: -{_fmt_money(exp_total)}\n"
            f"- Кассадаги соф нақд: {_fmt_money(cash_flow)}\n\n"
            f"Фойда:\n"
            f"- Ялпи фойда: {_fmt_money(gross_profit)}\n"
            f"- Операцион соф фойда: {_fmt_money(op_profit)}\n\n"
            f"Қайтиш ва қарзлар:\n"
            f"- Қайтишлар: {metrics['returned_count']} ({_fmt_money(metrics['returned_total'])})\n"
            f"- Жами очиқ қарз: {_fmt_money(metrics['open_debt_total'])}"
        )

    return (
        f"Z-Report {metrics['date']}\n"
        f"Qisqa xulosa: sof tushum {_fmt_money(d['net_sales'])}; qaytish {_fmt_pct(d['return_share'])}\n\n"
        f"Savdo:\n"
        f"- Cheklar soni: {metrics['sales_count']}\n"
        f"- Savdo summasi: {_fmt_money(metrics['sales_amount'])}\n\n"
        f"To'lovlar:\n"
        f"- Naqd: {_fmt_money(metrics['cash_total'])} ({_fmt_pct(d['cash_share'])})\n"
        f"- Karta: {_fmt_money(metrics['card_total'])} ({_fmt_pct(d['card_share'])})\n"
        f"{card_banks}"
        f"- Nasiya: {_fmt_money(metrics['debt_total'])} ({_fmt_pct(d['debt_share'])})\n\n"
        f"{exp_block}"
        f"Kassa naqd pul oqimi:\n"
        f"- Naqd tushum: +{_fmt_money(metrics['cash_total'])}\n"
        f"- Naqd qaytarish: -{_fmt_money(cash_refund)}\n"
        f"- Kassa chiqimlari: -{_fmt_money(exp_total)}\n"
        f"- Kassadagi sof naqd: {_fmt_money(cash_flow)}\n\n"
        f"Foyda:\n"
        f"- Yalpi foyda: {_fmt_money(gross_profit)}\n"
        f"- Operatsion sof foyda: {_fmt_money(op_profit)}\n\n"
        f"Qaytish va qarzlar:\n"
        f"- Qaytishlar: {metrics['returned_count']} ({_fmt_money(metrics['returned_total'])})\n"
        f"- Jami ochiq qarz: {_fmt_money(metrics['open_debt_total'])}"
    )


def _build_z_report_whatsapp_text(*, metrics: dict, lang: str) -> str:
    d = _report_derived(metrics)
    exp_block = _build_expenses_block(metrics, lang, is_whatsapp=True)
    gross_profit = metrics.get("today_gross_profit", metrics.get("gross_profit", 0))
    op_profit = metrics.get("today_operating_profit", metrics.get("operating_profit", 0))
    cash_flow = metrics.get("today_cash_net_flow", metrics.get("cash_total", 0))

    if lang == "ru":
        return (
            f"*Z-Report* _{metrics['date']}_\n"
            f"*Кратко:* чистая выручка {_fmt_money(d['net_sales'])}; возвраты {_fmt_pct(d['return_share'])}\n"
            f"- *Продажи:* {metrics['sales_count']}\n"
            f"- *Сумма продаж:* {_fmt_money(metrics['sales_amount'])}\n"
            f"- Наличные: {_fmt_money(metrics['cash_total'])} ({_fmt_pct(d['cash_share'])})\n"
            f"- Карта: {_fmt_money(metrics['card_total'])} ({_fmt_pct(d['card_share'])})\n"
            f"- Долг: {_fmt_money(metrics['debt_total'])} ({_fmt_pct(d['debt_share'])})\n"
            f"{exp_block}"
            f"- *Кассовый остаток наличных:* {_fmt_money(cash_flow)}\n"
            f"- *Валовая прибыль:* {_fmt_money(gross_profit)}\n"
            f"- *Чистая прибыль:* {_fmt_money(op_profit)}\n"
            f"- Возвраты: {metrics['returned_count']} / {_fmt_money(metrics['returned_total'])}\n"
            f"- *Чистая выручка:* {_fmt_money(d['net_sales'])}\n"
            f"- *Открытый долг:* {_fmt_money(metrics['open_debt_total'])}"
        )
    if lang == "uz-cyrl":
        return (
            f"*Z-Report* _{metrics['date']}_\n"
            f"*Қисқа хулоса:* соф тушум {_fmt_money(d['net_sales'])}; қайтиш {_fmt_pct(d['return_share'])}\n"
            f"- *Савдолар:* {metrics['sales_count']}\n"
            f"- *Савдо суммаси:* {_fmt_money(metrics['sales_amount'])}\n"
            f"- Нақд: {_fmt_money(metrics['cash_total'])} ({_fmt_pct(d['cash_share'])})\n"
            f"- Карта: {_fmt_money(metrics['card_total'])} ({_fmt_pct(d['card_share'])})\n"
            f"- Насия: {_fmt_money(metrics['debt_total'])} ({_fmt_pct(d['debt_share'])})\n"
            f"{exp_block}"
            f"- *Кассадаги соф нақд:* {_fmt_money(cash_flow)}\n"
            f"- *Ялпи фойда:* {_fmt_money(gross_profit)}\n"
            f"- *Соф фойда:* {_fmt_money(op_profit)}\n"
            f"- Қайтиш: {metrics['returned_count']} / {_fmt_money(metrics['returned_total'])}\n"
            f"- *Соф тушум:* {_fmt_money(d['net_sales'])}\n"
            f"- *Очиқ қарз:* {_fmt_money(metrics['open_debt_total'])}"
        )

    return (
        f"*Z-Report* _{metrics['date']}_\n"
        f"*Qisqa xulosa:* sof tushum {_fmt_money(d['net_sales'])}; qaytish {_fmt_pct(d['return_share'])}\n"
        f"- *Savdolar:* {metrics['sales_count']}\n"
        f"- *Savdo summasi:* {_fmt_money(metrics['sales_amount'])}\n"
        f"- Naqd: {_fmt_money(metrics['cash_total'])} ({_fmt_pct(d['cash_share'])})\n"
        f"- Karta: {_fmt_money(metrics['card_total'])} ({_fmt_pct(d['card_share'])})\n"
        f"- Nasiya: {_fmt_money(metrics['debt_total'])} ({_fmt_pct(d['debt_share'])})\n"
        f"{exp_block}"
        f"- *Kassadagi sof naqd:* {_fmt_money(cash_flow)}\n"
        f"- *Yalpi foyda:* {_fmt_money(gross_profit)}\n"
        f"- *Sof foyda:* {_fmt_money(op_profit)}\n"
        f"- Qaytish: {metrics['returned_count']} / {_fmt_money(metrics['returned_total'])}\n"
        f"- *Sof tushum:* {_fmt_money(d['net_sales'])}\n"
        f"- *Ochiq qarz:* {_fmt_money(metrics['open_debt_total'])}"
    )


def _telegram_token_ready(settings: IntegrationSettings) -> bool:
    return bool((settings.telegram_bot_token or "").strip())


def _telegram_ready(settings: IntegrationSettings) -> bool:
    """Legacy: token + default chat_id (or any Telegram ReportChannel)."""
    if not _telegram_token_ready(settings):
        return False
    if (settings.telegram_chat_id or "").strip():
        return True
    from .models import ReportChannel

    return ReportChannel.objects.filter(
        kind=ReportChannel.Kind.TELEGRAM, is_active=True
    ).exists()


def _whatsapp_provider_ready(settings: IntegrationSettings) -> bool:
    if settings.whatsapp_provider == IntegrationSettings.WhatsAppProvider.GREEN_API:
        return bool(
            settings.whatsapp_api_base
            and settings.greenapi_instance_id
            and settings.greenapi_api_token_instance
        )
    return bool(settings.whatsapp_api_base and settings.whatsapp_api_token)


def _whatsapp_ready(settings: IntegrationSettings) -> bool:
    if not _whatsapp_provider_ready(settings):
        return False
    if (settings.whatsapp_sender or "").strip():
        return True
    from .models import ReportChannel

    return ReportChannel.objects.filter(
        kind=ReportChannel.Kind.WHATSAPP, is_active=True
    ).exists()


def _send_telegram_text_to(*, settings: IntegrationSettings, chat_id: str, text: str):
    if not _telegram_token_ready(settings):
        raise ValueError("Telegram settings are incomplete")
    cid = (chat_id or "").strip()
    if not cid:
        raise ValueError("Telegram chat_id is empty")
    ok, details = _post_json(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
        {"chat_id": cid, "text": text},
        require_ok_field=True,
    )
    if not ok:
        retriable = "HTTP 4" not in details or "HTTP 429" in details
        raise NotificationDeliveryError(f"Telegram send failed: {details}", retriable=retriable)
    return details


def _send_telegram_text(*, settings: IntegrationSettings, text: str):
    return _send_telegram_text_to(
        settings=settings, chat_id=settings.telegram_chat_id, text=text
    )


def _send_telegram_document_to(
    *, settings: IntegrationSettings, chat_id: str, file_path: Path, caption: str = ""
):
    if not _telegram_token_ready(settings):
        raise ValueError("Telegram settings are incomplete")
    cid = (chat_id or "").strip()
    if not cid:
        raise ValueError("Telegram chat_id is empty")
    path = Path(file_path)
    if not path.is_file():
        raise ValueError(f"File not found: {path}")

    boundary = f"----GeeksPos{uuid.uuid4().hex}"
    file_bytes = path.read_bytes()
    filename = path.name

    def _part(name: str, value: bytes, *, filename: str | None = None, content_type: str | None = None) -> bytes:
        lines = [f"--{boundary}".encode(), f'Content-Disposition: form-data; name="{name}"'.encode()]
        if filename is not None:
            lines[1] = (
                f'Content-Disposition: form-data; name="{name}"; filename="{filename}"'.encode()
            )
        if content_type:
            lines.append(f"Content-Type: {content_type}".encode())
        lines.append(b"")
        lines.append(value)
        return b"\r\n".join(lines)

    body = b"\r\n".join(
        [
            _part("chat_id", str(cid).encode()),
            _part("caption", (caption or "")[:900].encode("utf-8")),
            _part(
                "document",
                file_bytes,
                filename=filename,
                content_type="application/octet-stream",
            ),
            f"--{boundary}--".encode(),
            b"",
        ]
    )
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendDocument"
    req = Request(url, data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    try:
        with urlopen(req, timeout=120) as resp:  # nosec B310
            raw = resp.read().decode("utf-8") if resp else ""
            try:
                parsed = json.loads(raw or "{}")
            except json.JSONDecodeError:
                raise NotificationDeliveryError("Telegram document failed: Invalid JSON response", retriable=True)
            if not bool(parsed.get("ok")):
                detail = parsed.get("description") or parsed.get("error") or "ok=false"
                raise NotificationDeliveryError(f"Telegram document failed: {detail}", retriable=False)
            return raw
    except NotificationDeliveryError:
        raise
    except HTTPError as e:
        details = f"HTTP {e.code}"
        retriable = e.code >= 500 or e.code == 429
        raise NotificationDeliveryError(f"Telegram document failed: {details}", retriable=retriable)
    except URLError as e:
        raise NotificationDeliveryError(f"Telegram document failed: {e.reason}", retriable=True)


def _send_telegram_document(*, settings: IntegrationSettings, file_path: Path, caption: str = ""):
    return _send_telegram_document_to(
        settings=settings,
        chat_id=settings.telegram_chat_id,
        file_path=file_path,
        caption=caption,
    )


def _send_whatsapp_text_to(*, settings: IntegrationSettings, address: str, text: str):
    if not _whatsapp_provider_ready(settings):
        raise ValueError("WhatsApp settings are incomplete")
    dest = (address or "").strip()
    if not dest:
        raise ValueError("WhatsApp address is empty")
    if settings.whatsapp_provider == IntegrationSettings.WhatsAppProvider.GREEN_API:
        chat_id = dest if "@c.us" in dest else f"{dest}@c.us"
        payload = {"chatId": chat_id, "message": text}
        url = (
            settings.whatsapp_api_base.rstrip("/")
            + f"/waInstance{settings.greenapi_instance_id}/sendMessage/{settings.greenapi_api_token_instance}"
        )
        ok, details = _post_json(url, payload)
    else:
        payload = {"to": dest, "message": text, "sender": settings.whatsapp_sender or dest}
        ok, details = _post_json(
            settings.whatsapp_api_base.rstrip("/") + "/messages/send",
            payload,
            headers={"Authorization": f"Bearer {settings.whatsapp_api_token}"},
        )
    if not ok:
        retriable = "HTTP 4" not in details or "HTTP 429" in details
        raise NotificationDeliveryError(f"WhatsApp send failed: {details}", retriable=retriable)
    return details


def _send_whatsapp_text(*, settings: IntegrationSettings, text: str):
    return _send_whatsapp_text_to(
        settings=settings, address=settings.whatsapp_sender, text=text
    )


def _send_whatsapp_debt_reminder_now(
    *,
    settings: IntegrationSettings,
    phone: str,
    customer_name: str,
    amount: str,
    lang: str = "uz",
    debt_items: list[dict] | None = None,
    reminder_kind: str = "debt_reminder",
    payment_amount: str = "0",
    payment_time: str = "-",
    is_partial: bool = False,
    total_remaining: str = "0",
    store_name: str = "",
    store_phone: str = "",
):
    if not settings.whatsapp_api_base:
        raise ValueError("WhatsApp settings are incomplete")
    selected_lang = _norm_lang(lang)
    rows = debt_items or []
    if selected_lang == "ru":
        if reminder_kind == "repayment_update":
            lines = [
                f"Здравствуйте, {customer_name}.",
                "Платёж по задолженности принят.",
                f"Сумма платежа: {payment_amount}",
                f"Время платежа: {payment_time}",
                (
                    f"Статус: частичное погашение. Остаток долга: {total_remaining}"
                    if is_partial
                    else "Статус: задолженность погашена полностью."
                ),
                "",
            ]
        else:
            lines = [
                f"Здравствуйте, {customer_name}.",
                "Напоминание о задолженности по вашему магазину.",
                f"Сумма долга к оплате: {amount}",
                "",
            ]
        if rows:
            lines.append("Детали по долгам:")
            for idx, row in enumerate(rows, start=1):
                lines.extend(
                    [
                        f"{idx}) Продажа: {row.get('sale_no') or '-'}",
                        f"   Сумма покупки: {row.get('total_amount') or '-'}",
                        f"   Погашено сейчас: {row.get('paid_now') or '-'}",
                        f"   Осталось к оплате: {row.get('remaining_amount') or '-'}",
                        f"   Время покупки: {row.get('sale_time') or '-'}",
                        f"   Дата выдачи долга: {row.get('debt_created_at') or '-'}",
                        f"   Срок оплаты: {row.get('due_date') or '-'}",
                    ]
                )
                products = row.get("products") or []
                if products:
                    lines.append("   Товары:")
                    for p in products:
                        lines.append(
                            f"   - {p.get('name') or '-'} x{p.get('qty') or '1'} "
                            f"({p.get('line_total') or p.get('unit_price') or '-'})"
                        )
        lines.append("")
        lines.append(
            "Спасибо за оплату!"
            if reminder_kind == "repayment_update"
            else "Пожалуйста, внесите оплату в ближайшее время. Спасибо!"
        )
        if store_name or store_phone:
            lines.append("")
            lines.append("Контакты магазина:")
            if store_name:
                lines.append(f"- Магазин: {store_name}")
            if store_phone:
                lines.append(f"- Телефон: {store_phone}")
    else:
        if reminder_kind == "repayment_update":
            lines = [
                f"Assalomu alaykum, {customer_name}.",
                "Qarz bo'yicha to'lov qabul qilindi.",
                f"To'langan summa: {payment_amount}",
                f"To'lov vaqti: {payment_time}",
                (
                    f"Holat: qisman yopildi. Qolgan qarz: {total_remaining}"
                    if is_partial
                    else "Holat: qarz to'liq yopildi."
                ),
                "",
            ]
        else:
            lines = [
                f"Assalomu alaykum, {customer_name}.",
                "Do'koningiz bo'yicha qarz eslatmasi.",
                f"To'lanishi kerak bo'lgan qarz summasi: {amount}",
                "",
            ]
        if rows:
            lines.append("Qarz tafsilotlari:")
            for idx, row in enumerate(rows, start=1):
                lines.extend(
                    [
                        f"{idx}) Savdo: {row.get('sale_no') or '-'}",
                        f"   Xarid summasi: {row.get('total_amount') or '-'}",
                        f"   Hozir yopilgan summa: {row.get('paid_now') or '-'}",
                        f"   Qolgan qarz: {row.get('remaining_amount') or '-'}",
                        f"   Xarid vaqti: {row.get('sale_time') or '-'}",
                        f"   Qarz berilgan vaqti: {row.get('debt_created_at') or '-'}",
                        f"   To'lov muddati: {row.get('due_date') or '-'}",
                    ]
                )
                products = row.get("products") or []
                if products:
                    lines.append("   Mahsulotlar:")
                    for p in products:
                        lines.append(
                            f"   - {p.get('name') or '-'} x{p.get('qty') or '1'} "
                            f"({p.get('line_total') or p.get('unit_price') or '-'})"
                        )
        lines.append("")
        lines.append(
            "To'lov uchun rahmat!"
            if reminder_kind == "repayment_update"
            else "Iltimos, qulay vaqtda to'lovni amalga oshiring. Rahmat!"
        )
        if store_name or store_phone:
            lines.append("")
            lines.append("Do'kon aloqa ma'lumotlari:")
            if store_name:
                lines.append(f"- Do'kon: {store_name}")
            if store_phone:
                lines.append(f"- Telefon: {store_phone}")
    message = "\n".join(lines)
    if settings.whatsapp_provider == IntegrationSettings.WhatsAppProvider.GREEN_API:
        if not settings.greenapi_instance_id or not settings.greenapi_api_token_instance:
            raise ValueError("GreenAPI settings are incomplete")
        chat_id = phone if "@c.us" in phone else f"{phone}@c.us"
        payload = {"chatId": chat_id, "message": message}
        url = (
            settings.whatsapp_api_base.rstrip("/")
            + f"/waInstance{settings.greenapi_instance_id}/sendMessage/{settings.greenapi_api_token_instance}"
        )
        ok, details = _post_json(url, payload)
    else:
        if not settings.whatsapp_api_token:
            raise ValueError("WhatsApp settings are incomplete")
        payload = {"to": phone, "message": message, "sender": settings.whatsapp_sender}
        ok, details = _post_json(
            settings.whatsapp_api_base.rstrip("/") + "/messages/send",
            payload,
            headers={"Authorization": f"Bearer {settings.whatsapp_api_token}"},
        )
    if not ok:
        retriable = "HTTP 4" not in details or "HTTP 429" in details
        raise NotificationDeliveryError(f"WhatsApp send failed: {details}", retriable=retriable)
    return details


def send_daily_z_report(*, lang: str | None = None):
    today = str(timezone.localdate())
    return send_z_report_multichannel(
        lang=resolve_report_lang(preferred=lang),
        from_date=today,
        to_date=today,
    )


def _should_queue_after_telegram_error(exc: Exception) -> bool:
    if isinstance(exc, NotificationDeliveryError):
        return exc.retriable
    msg = str(exc).lower()
    return "incomplete" not in msg


def _should_queue_after_whatsapp_error(exc: Exception) -> bool:
    if isinstance(exc, NotificationDeliveryError):
        return exc.retriable
    msg = str(exc).lower()
    return "incomplete" not in msg and "settings are incomplete" not in msg


def send_z_report_multichannel(*, lang: str = "uz", from_date: str | None = None, to_date: str | None = None):
    from .models import ReportRoute
    from .report_routing import deliver_text_report, ensure_channels_from_legacy

    ensure_channels_from_legacy()
    selected_lang = resolve_report_lang(preferred=lang)
    metrics = sales_metrics(from_date=from_date, to_date=to_date)
    text_telegram = _build_z_report_text(metrics=metrics, lang=selected_lang)
    text_whatsapp = _build_z_report_whatsapp_text(metrics=metrics, lang=selected_lang)
    out = deliver_text_report(
        report_type=ReportRoute.ReportType.DAILY_Z,
        text_telegram=text_telegram,
        text_whatsapp=text_whatsapp,
        queue_kind_telegram=NotificationQueue.Kind.Z_REPORT_TELEGRAM,
        queue_kind_whatsapp=NotificationQueue.Kind.Z_REPORT_WHATSAPP,
        queue_payload_extra={
            "lang": selected_lang,
            "from_date": from_date,
            "to_date": to_date,
        },
    )
    return {**out, "lang": selected_lang}


def _build_low_stock_report_text(*, lang: str) -> str:
    from catalog.low_stock import get_low_stock_variants

    code = _norm_lang(lang)
    variants = get_low_stock_variants()
    if code == "ru":
        title = "Низкий остаток"
        empty = "Товаров с низким остатком нет."
        line_fmt = "{name}: {qty} (порог {thr})"
    elif code == "uz-cyrl":
        title = "Кам қолдиқ"
        empty = "Кам қолдиқли товарлар йўқ."
        line_fmt = "{name}: {qty} (чегара {thr})"
    else:
        title = "Kam qoldiq"
        empty = "Kam qoldiqli mahsulotlar yo‘q."
        line_fmt = "{name}: {qty} (chegara {thr})"

    if not variants:
        return f"{title}\n{empty}"

    lines = [title, ""]
    for v in variants[:40]:
        name = (
            (v.get("product_name_ru") if code == "ru" else v.get("product_name_uz"))
            or v.get("product_name_uz")
            or v.get("barcode")
            or "?"
        )
        lines.append(
            line_fmt.format(
                name=name,
                qty=v.get("stock_qty"),
                thr=v.get("threshold"),
            )
        )
    if len(variants) > 40:
        lines.append(f"... +{len(variants) - 40}")
    return "\n".join(lines)


def send_low_stock_report(*, lang: str | None = None) -> dict:
    from .models import ReportRoute
    from .report_routing import deliver_text_report, ensure_channels_from_legacy

    ensure_channels_from_legacy()
    selected_lang = resolve_report_lang(preferred=lang)
    text = _build_low_stock_report_text(lang=selected_lang)
    out = deliver_text_report(
        report_type=ReportRoute.ReportType.LOW_STOCK,
        text_telegram=text,
        text_whatsapp=text,
        queue_kind_telegram=NotificationQueue.Kind.LOW_STOCK_TELEGRAM,
        queue_kind_whatsapp=NotificationQueue.Kind.LOW_STOCK_WHATSAPP,
        queue_payload_extra={"lang": selected_lang},
    )
    return {**out, "lang": selected_lang}


def run_auto_daily_low_stock_report_if_due(*, now=None) -> dict:
    """Daily scheduler hook. Sends low-stock alert at most once per local day."""
    ref_now = now or timezone.localtime()
    today = timezone.localdate()
    settings = IntegrationSettings.get_solo()
    if not settings.auto_low_stock_report_enabled:
        return {"ran": False, "reason": "disabled"}
    if settings.last_auto_low_stock_report_date == today:
        return {"ran": False, "reason": "already_sent"}
    out = send_low_stock_report(lang=resolve_report_lang())
    settings.last_auto_low_stock_report_date = today
    settings.save(update_fields=["last_auto_low_stock_report_date", "updated_at"])
    return {"ran": True, "reason": "sent", "result": out, "at": ref_now.isoformat()}


def send_whatsapp_reminder(
    *,
    phone: str,
    customer_name: str,
    amount: str,
    lang: str = "uz",
    debt_items: list[dict] | None = None,
    reminder_kind: str = "debt_reminder",
    payment_amount: str = "0",
    payment_time: str = "-",
    is_partial: bool = False,
    total_remaining: str = "0",
    store_name: str = "",
    store_phone: str = "",
):
    from .notification_queue import enqueue

    settings = IntegrationSettings.get_solo()
    store = StoreSettings.get_solo()
    resolved_store_name = (store_name or store.brand_name or "").strip()
    resolved_store_phone = (store_phone or store.phone or "").strip()
    try:
        details = _send_whatsapp_debt_reminder_now(
            settings=settings,
            phone=phone,
            customer_name=customer_name,
            amount=str(amount),
            lang=lang,
            debt_items=debt_items or [],
            reminder_kind=reminder_kind,
            payment_amount=payment_amount,
            payment_time=payment_time,
            is_partial=is_partial,
            total_remaining=total_remaining,
            store_name=resolved_store_name,
            store_phone=resolved_store_phone,
        )
        return {"ok": True, "details": details, "queued": False}
    except ValueError as e:
        msg = str(e)
        if not _should_queue_after_whatsapp_error(e):
            raise
        enqueue(
            NotificationQueue.Kind.WHATSAPP_DEBT_REMINDER,
            {
                "phone": phone,
                "customer_name": customer_name,
                "amount": str(amount),
                "lang": _norm_lang(lang),
                "debt_items": debt_items or [],
                "reminder_kind": reminder_kind,
                "payment_amount": str(payment_amount),
                "payment_time": str(payment_time),
                "is_partial": bool(is_partial),
                "total_remaining": str(total_remaining),
                "store_name": resolved_store_name,
                "store_phone": resolved_store_phone,
            },
        )
        return {"ok": True, "details": msg, "queued": True}


def run_auto_daily_z_report_if_due(*, now=None) -> dict:
    """
    Daily scheduler hook. Sends at most once per local day.
    Returns: {"ran": bool, "reason": str, ...}
    """
    ref_now = now or timezone.localtime()
    today = timezone.localdate()
    settings = IntegrationSettings.get_solo()
    if not settings.auto_daily_z_report_enabled:
        return {"ran": False, "reason": "disabled"}
    if settings.last_auto_z_report_date == today:
        return {"ran": False, "reason": "already_sent"}
    out = send_daily_z_report(lang=resolve_report_lang())
    settings.last_auto_z_report_date = today
    settings.save(update_fields=["last_auto_z_report_date"])
    return {"ran": True, "reason": "sent", "result": out, "at": ref_now.isoformat()}


def _safe_sqlite_snapshot(dest: Path) -> Path:
    """Copy live SQLite DB into dest using the backup API (WAL-safe)."""
    import sqlite3

    db_path = Path(django_settings.DATABASES["default"]["NAME"])
    if not db_path.exists():
        raise FileNotFoundError(str(db_path))
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        dest.unlink()
    src = sqlite3.connect(str(db_path))
    try:
        dst = sqlite3.connect(str(dest))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    return dest


def run_telegram_db_backup_if_due(*, now=None, force: bool = False) -> dict:
    """
    Send SQLite DB file to Telegram channels on the db_backup route every N days (1 or 3; 0 = off).
    """
    from .models import ReportRoute
    from .report_routing import deliver_telegram_document_report, ensure_channels_from_legacy

    ref_now = now or timezone.localtime()
    settings = IntegrationSettings.get_solo()
    interval = int(settings.telegram_db_backup_interval_days or 0)
    if not force and interval <= 0:
        return {"ran": False, "reason": "disabled"}
    if not _telegram_token_ready(settings):
        return {"ran": False, "reason": "telegram_incomplete"}

    ensure_channels_from_legacy()

    if not force and settings.last_telegram_db_backup_at:
        last = timezone.localtime(settings.last_telegram_db_backup_at)
        days = (ref_now.date() - last.date()).days
        if days < interval:
            return {
                "ran": False,
                "reason": f"next_in_{interval - days}_day(s)",
                "last_at": last.isoformat(),
            }

    stamp = ref_now.strftime("%Y%m%d-%H%M%S")
    store = StoreSettings.get_solo()
    brand = (store.brand_name or "pos").strip().replace(" ", "_")[:40] or "pos"
    out_dir = Path.home() / "Documents" / "GeeksPOS" / "backups"
    dest = out_dir / f"{brand}-db-{stamp}.sqlite3"
    try:
        _safe_sqlite_snapshot(dest)
        caption = f"DB backup {stamp} ({brand})"
        sent = deliver_telegram_document_report(
            report_type=ReportRoute.ReportType.DB_BACKUP,
            file_path=dest,
            caption=caption,
        )
        if not sent.get("ok"):
            return {
                "ran": False,
                "reason": sent.get("details") or "send_failed",
                "backup_path": str(dest),
                "channel_results": sent.get("channel_results"),
            }
        settings.last_telegram_db_backup_at = ref_now
        settings.save(update_fields=["last_telegram_db_backup_at", "updated_at"])
        return {
            "ran": True,
            "reason": "sent",
            "backup_path": str(dest),
            "details": sent.get("details"),
            "channel_results": sent.get("channel_results"),
        }
    except Exception as exc:
        return {"ran": False, "reason": str(exc), "backup_path": str(dest) if dest.exists() else None}


def send_whatsapp_text(*, text: str, phone: str | None = None) -> str:
    settings = IntegrationSettings.get_solo()
    if not _whatsapp_ready(settings):
        raise ValueError("WhatsApp settings are incomplete")
    
    target_phone = phone or settings.whatsapp_sender
    if not target_phone:
        raise ValueError("No destination phone number provided or configured")
        
    if settings.whatsapp_provider == IntegrationSettings.WhatsAppProvider.GREEN_API:
        chat_id = target_phone if "@c.us" in target_phone else f"{target_phone}@c.us"
        payload = {"chatId": chat_id, "message": text}
        url = (
            settings.whatsapp_api_base.rstrip("/")
            + f"/waInstance{settings.greenapi_instance_id}/sendMessage/{settings.greenapi_api_token_instance}"
        )
        ok, details = _post_json(url, payload)
    else:
        payload = {"to": target_phone, "message": text, "sender": settings.whatsapp_sender}
        ok, details = _post_json(
            settings.whatsapp_api_base.rstrip("/") + "/messages/send",
            payload,
            headers={"Authorization": f"Bearer {settings.whatsapp_api_token}"},
        )
    if not ok:
        retriable = "HTTP 4" not in details or "HTTP 429" in details
        raise NotificationDeliveryError(f"WhatsApp send failed: {details}", retriable=retriable)
    return details

