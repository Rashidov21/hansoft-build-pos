from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from decimal import Decimal
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from io import BytesIO

from core.permissions import IsAdminOrOwner, IsCashier
from .return_report import return_history_rows, return_history_summary
from .services import cashier_x_report_metrics, default_shift_window, sales_metrics


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request):
        from_date = request.query_params.get("from")
        to_date = request.query_params.get("to")
        year = (request.query_params.get("year") or "").strip()
        if year:
            try:
                y = int(year)
                from_date = f"{y:04d}-01-01"
                to_date = f"{y:04d}-12-31"
            except ValueError:
                return Response({"code": "INVALID_YEAR", "detail": "year must be numeric"}, status=400)
        if not from_date and not to_date:
            today = timezone.localdate()
            first = today.replace(day=1)
            from_date = first.isoformat()
            to_date = today.isoformat()
        if from_date and parse_date(from_date) is None:
            return Response({"code": "INVALID_DATE_FROM", "detail": "from must be YYYY-MM-DD"}, status=400)
        if to_date and parse_date(to_date) is None:
            return Response({"code": "INVALID_DATE_TO", "detail": "to must be YYYY-MM-DD"}, status=400)
        m = sales_metrics(from_date=from_date, to_date=to_date)

        return Response(
            {
                "totals": {
                    "sales_count": m["sales_count"],
                    "sales_amount": str(m["sales_amount"]),
                    "today_sales_amount": str(m["today_sales_amount"]),
                    "today_sales_count": m["today_sales_count"],
                    "today_items_sold_qty": m["today_items_sold_qty"],
                    "today_return_move_count": m["today_return_move_count"],
                    "today_return_qty": m["today_return_qty"],
                    "today_returned_total": str(m["today_returned_total"]),
                    "today_net_sales": str(m["today_net_sales"]),
                    "today_void_count": m["today_void_count"],
                    "today_cash_total": str(m["today_cash_total"]),
                    "today_card_total": str(m["today_card_total"]),
                    "today_debt_total": str(m["today_debt_total"]),
                    "today_card_by_bank": [
                        {"bank": x["bank"], "label": x["label"], "amount": str(x["amount"])}
                        for x in m.get("today_card_by_bank") or []
                    ],
                    "card_by_bank": [
                        {"bank": x["bank"], "label": x["label"], "amount": str(x["amount"])}
                        for x in m.get("card_by_bank") or []
                    ],
                    "today_bonus_qty": m.get("today_bonus_qty", 0),
                    "today_bonus_cost": str(m.get("today_bonus_cost", 0)),
                    "today_bonus_list_value": str(m.get("today_bonus_list_value", 0)),
                    "today_bonus_items": m.get("today_bonus_items") or [],
                    "bonus_qty": m.get("bonus_qty", 0),
                    "bonus_cost": str(m.get("bonus_cost", 0)),
                    "bonus_list_value": str(m.get("bonus_list_value", 0)),
                    "expense_total": str(m["expense_total"]),
                    "today_expense_total": str(m["today_expense_total"]),
                    "today_gross_profit": str(m["today_gross_profit"]),
                    "today_operating_profit": str(m["today_operating_profit"]),
                    "void_count": m["void_count"],
                    "avg_check": str(m["avg_check"]),
                    "gross_profit": str(m["gross_profit"]),
                    "operating_profit": str(m["operating_profit"]),
                    "net_sales_approx": str(m["net_sales_approx"]),
                    "total_discounts": str(m["total_discounts"]),
                    "open_debt_count": m["open_debt_count"],
                    "open_debt_total": str(m["open_debt_total"]),
                    "cash_total": str(m["cash_total"]),
                    "card_total": str(m["card_total"]),
                    "debt_total": str(m["debt_total"]),
                    "returned_total": str(m["returned_total"]),
                    "returned_total_attributed": str(m["returned_total_attributed"]),
                    "returned_cogs": str(m["returned_cogs"]),
                    "refund_total": str(m["refund_total"]),
                    "net_sales_accrual": str(m["net_sales_accrual"]),
                    "inventory_items": m["inventory_items"],
                    "inventory_purchase_value": str(m["inventory_purchase_value"]),
                    "inventory_sale_value": str(m["inventory_sale_value"]),
                    "turnover_amount": str(m["turnover_amount"]),
                    "net_profit": str(m["net_profit"]),
                },
                "top_cashiers": m["top_cashiers"],
                "top_products": m["top_products"],
                "top_brands": m["top_brands"],
                "low_products": m["low_products"],
                "low_brands": m["low_brands"],
                "range": {"from": from_date, "to": to_date, "year": year or None},
            }
        )


class CashierXReportView(APIView):
    """Interim shift-style totals for the logged-in cashier (not Z-report / no shift close)."""

    permission_classes = [IsAuthenticated, IsCashier]

    def get(self, request):
        raw_from = (request.query_params.get("from") or "").strip()
        raw_to = (request.query_params.get("to") or "").strip()
        tz = timezone.get_current_timezone()
        if raw_from:
            from_dt = parse_datetime(raw_from)
            if from_dt is None:
                return Response({"code": "INVALID_FROM", "detail": "from must be ISO datetime"}, status=400)
            if timezone.is_naive(from_dt):
                from_dt = timezone.make_aware(from_dt, tz)
        else:
            from_dt, _ = default_shift_window()
        if raw_to:
            to_dt = parse_datetime(raw_to)
            if to_dt is None:
                return Response({"code": "INVALID_TO", "detail": "to must be ISO datetime"}, status=400)
            if timezone.is_naive(to_dt):
                to_dt = timezone.make_aware(to_dt, tz)
        else:
            to_dt = timezone.now()
        if to_dt < from_dt:
            return Response({"code": "INVALID_RANGE", "detail": "to must be >= from"}, status=400)
        metrics = cashier_x_report_metrics(cashier_id=request.user.id, from_dt=from_dt, to_dt=to_dt)
        if metrics is None:
            return Response({"code": "USER_NOT_FOUND", "detail": "Cashier not found"}, status=404)
        return Response(metrics)


def _parse_report_dates(request):
    from_date = request.query_params.get("from")
    to_date = request.query_params.get("to")
    if from_date and parse_date(from_date) is None:
        return None, None, Response({"code": "INVALID_DATE_FROM", "detail": "from must be YYYY-MM-DD"}, status=400)
    if to_date and parse_date(to_date) is None:
        return None, None, Response({"code": "INVALID_DATE_TO", "detail": "to must be YYYY-MM-DD"}, status=400)
    return from_date, to_date, None


class ReturnsHistoryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request):
        from_date, to_date, err = _parse_report_dates(request)
        if err is not None:
            return err
        q = (request.query_params.get("q") or "").strip()
        summary = return_history_summary(from_date=from_date, to_date=to_date, q=q)
        rows = return_history_rows(from_date=from_date, to_date=to_date, q=q)
        page = max(int(request.query_params.get("page") or 1), 1)
        page_size = min(max(int(request.query_params.get("page_size") or 20), 1), 100)
        total = len(rows)
        start = (page - 1) * page_size
        end = start + page_size
        return Response(
            {
                "summary": {k: str(v) if isinstance(v, Decimal) else v for k, v in summary.items()},
                "count": total,
                "page": page,
                "page_size": page_size,
                "results": rows[start:end],
                "range": {"from": from_date, "to": to_date},
            }
        )


class ReturnsHistoryExportXlsxView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request):
        from openpyxl import Workbook

        from_date, to_date, err = _parse_report_dates(request)
        if err is not None:
            return err
        q = (request.query_params.get("q") or "").strip()
        summary = return_history_summary(from_date=from_date, to_date=to_date, q=q)
        rows = return_history_rows(from_date=from_date, to_date=to_date, q=q)

        wb = Workbook()
        ws = wb.active
        ws.title = "Returns"
        ws.append(
            [
                "returned_at",
                "public_sale_no",
                "sale_completed_at",
                "cashier",
                "returned_by",
                "brand_uz",
                "model_uz",
                "barcode",
                "qty",
                "return_amount",
                "note",
            ]
        )
        for row in rows:
            ws.append(
                [
                    row["returned_at"],
                    row["public_sale_no"],
                    row["sale_completed_at"],
                    row["cashier_username"],
                    row["returned_by"],
                    row["category_name_uz"],
                    row["product_name_uz"],
                    row["barcode"],
                    row["qty"],
                    float(row["return_amount"]),
                    row["note"],
                ]
            )
        ws2 = wb.create_sheet("Summary")
        ws2.append(["metric", "value"])
        for key, val in summary.items():
            ws2.append([key, str(val)])

        out = BytesIO()
        wb.save(out)
        out.seek(0)
        resp = HttpResponse(
            out.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        resp["Content-Disposition"] = 'attachment; filename="returns_history.xlsx"'
        return resp

