from django.db.models import Q
from decimal import Decimal
from django.db.models import Sum
from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.exceptions import DebtPolicyError
from core.permissions import IsCashier

from .models import Customer, Debt, DebtPayment
from .serializers import (
    CustomerSerializer,
    DebtPaymentHistorySerializer,
    DebtPaymentSerializer,
    DebtSerializer,
)
from .services import record_debt_payment


class CustomerSearchView(generics.ListAPIView):
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, IsCashier]

    def get_queryset(self):
        q = (self.request.query_params.get("q") or "").strip()
        if not q:
            return Customer.objects.none()
        return Customer.objects.filter(
            Q(name__icontains=q) | Q(phone_normalized__icontains=q)
        )[:50]


class CustomerCreateView(generics.CreateAPIView):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, IsCashier]


class CustomerUpdateView(generics.UpdateAPIView):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, IsCashier]


class OpenDebtsView(generics.ListAPIView):
    serializer_class = DebtSerializer
    permission_classes = [IsAuthenticated, IsCashier]

    def get_queryset(self):
        return Debt.objects.filter(status=Debt.Status.OPEN).select_related("customer").order_by("due_date", "created_at")


class DebtListView(generics.ListAPIView):
    """
    All debts for the Debts page filters.

    Query params:
      status=OPEN|PAID|ALL (default ALL; VOIDED is never returned)
      q=customer name / phone
      due_from / due_to = YYYY-MM-DD (inclusive, applied to due_date)
    """

    serializer_class = DebtSerializer
    permission_classes = [IsAuthenticated, IsCashier]
    pagination_class = None

    def get_queryset(self):
        params = self.request.query_params
        qs = Debt.objects.select_related("customer").exclude(status=Debt.Status.VOIDED)
        status = (params.get("status") or "ALL").strip().upper()
        if status in {"OPEN", "PAID"}:
            qs = qs.filter(status=status)
        q = (params.get("q") or "").strip()
        if q:
            digits = "".join(ch for ch in q if ch.isdigit())
            cond = Q(customer__name__icontains=q)
            if digits:
                cond |= Q(customer__phone_normalized__icontains=digits)
            qs = qs.filter(cond)
        due_from = (params.get("due_from") or "").strip()
        due_to = (params.get("due_to") or "").strip()
        if due_from:
            qs = qs.filter(due_date__gte=due_from)
        if due_to:
            qs = qs.filter(due_date__lte=due_to)
        return qs.order_by("due_date", "-created_at")[:1000]


class DebtPaymentView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def get(self, request):
        """To‘lovlar tarixi: ?customer_id=<uuid> (majburiy)."""
        customer_id = (request.query_params.get("customer_id") or "").strip()
        if not customer_id:
            return Response(
                {"code": "CUSTOMER_ID_REQUIRED", "detail": "customer_id query param is required"},
                status=400,
            )
        try:
            cust = Customer.objects.get(pk=customer_id)
        except (Customer.DoesNotExist, ValueError):
            return Response({"code": "CUSTOMER_NOT_FOUND", "detail": "Customer not found"}, status=404)
        rows = (
            DebtPayment.objects.filter(customer=cust)
            .select_related("customer", "recorded_by")
            .prefetch_related("allocations")
            .order_by("-created_at", "-id")[:200]
        )
        return Response(DebtPaymentHistorySerializer(rows, many=True).data)

    def post(self, request):
        ser = DebtPaymentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            cust = Customer.objects.get(pk=ser.validated_data["customer_id"])
        except Customer.DoesNotExist:
            return Response({"code": "CUSTOMER_NOT_FOUND", "detail": "Customer not found"}, status=404)
        open_before_qs = Debt.objects.filter(customer=cust, status=Debt.Status.OPEN).values("id", "remaining_amount")
        before_map = {str(r["id"]): Decimal(str(r["remaining_amount"])) for r in open_before_qs}
        try:
            touched = record_debt_payment(
                customer=cust,
                amount=ser.validated_data["amount"],
                user=request.user,
                method=ser.validated_data.get("method") or DebtPayment.Method.CASH,
                card_bank=ser.validated_data.get("card_bank") or "",
                note=ser.validated_data.get("note") or "",
            )
        except (ValueError, DebtPolicyError) as exc:
            return Response({"code": "DEBT_PAYMENT_FAILED", "detail": str(exc)}, status=400)
        # Best-effort debtor notification after payment (does not block API success).
        try:
            from integrations.debt_reminders import sale_line_products
            from integrations.services import send_whatsapp_reminder

            touched_full = (
                Debt.objects.filter(id__in=[d.id for d in touched])
                .select_related("originating_sale")
                .order_by("due_date", "created_at")
            )
            lang = (request.headers.get("Accept-Language") or "uz").split(",")[0]
            reminder_items: list[dict] = []
            for d in touched_full:
                sale_no = (
                    d.originating_sale.public_sale_no or str(d.originating_sale_id)[:8]
                    if d.originating_sale_id
                    else "-"
                )
                sale_time = (
                    timezone.localtime(d.originating_sale.completed_at).strftime("%Y-%m-%d %H:%M")
                    if d.originating_sale_id and d.originating_sale.completed_at
                    else "-"
                )
                before_remaining = before_map.get(str(d.id), d.remaining_amount)
                paid_now = before_remaining - d.remaining_amount
                products = (
                    sale_line_products(sale_id=d.originating_sale_id, lang=lang)
                    if d.originating_sale_id
                    else []
                )
                reminder_items.append(
                    {
                        "sale_no": sale_no,
                        "total_amount": str(d.total_amount),
                        "paid_now": str(paid_now),
                        "remaining_amount": str(d.remaining_amount),
                        "sale_time": sale_time,
                        "debt_created_at": timezone.localtime(d.created_at).strftime("%Y-%m-%d %H:%M"),
                        "due_date": d.due_date.isoformat() if d.due_date else "-",
                        "products": products,
                    }
                )
            total_remaining = (
                Debt.objects.filter(customer=cust, status=Debt.Status.OPEN).aggregate(total=Sum("remaining_amount"))["total"]
                or Decimal("0")
            )
            send_whatsapp_reminder(
                phone=cust.phone_normalized,
                customer_name=cust.name,
                amount=str(total_remaining),
                lang=(request.headers.get("Accept-Language") or "uz").split(",")[0],
                debt_items=reminder_items,
                reminder_kind="repayment_update",
                payment_amount=str(ser.validated_data["amount"]),
                payment_time=timezone.localtime().strftime("%Y-%m-%d %H:%M"),
                is_partial=total_remaining > 0,
                total_remaining=str(total_remaining),
            )
        except Exception:
            pass
        touched_ids = [d.id for d in touched]
        touched_rows = Debt.objects.filter(id__in=touched_ids).select_related("customer")
        return Response(DebtSerializer(touched_rows, many=True).data)
