from rest_framework import serializers

from .models import Customer, Debt, DebtPayment, DebtPaymentAllocation


class CustomerSerializer(serializers.ModelSerializer):
    def validate_phone_normalized(self, value: str) -> str:
        raw = (value or "").strip()
        if raw.startswith("+"):
            raise serializers.ValidationError("Phone must be entered without '+' and with country code (example: 998901112233).")
        if not raw.isdigit():
            raise serializers.ValidationError("Phone must contain digits only and include country code.")
        if len(raw) < 9 or len(raw) > 15:
            raise serializers.ValidationError("Phone length is invalid. Include country code, without '+'.")
        return raw

    class Meta:
        model = Customer
        fields = ["id", "name", "phone_normalized", "note", "created_at"]


class DebtSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(
        source="customer.phone_normalized", read_only=True
    )

    class Meta:
        model = Debt
        fields = [
            "id",
            "customer",
            "customer_name",
            "customer_phone",
            "total_amount",
            "paid_amount",
            "remaining_amount",
            "due_date",
            "installment_months",
            "monthly_amount",
            "status",
            "created_at",
        ]


class DebtPaymentSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    method = serializers.ChoiceField(
        choices=DebtPayment.Method.choices,
        required=False,
        default=DebtPayment.Method.CASH,
    )
    card_bank = serializers.CharField(required=False, allow_blank=True, default="")
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=500)


class DebtPaymentAllocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DebtPaymentAllocation
        fields = ["id", "debt", "amount"]


class DebtPaymentHistorySerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    recorded_by_username = serializers.CharField(
        source="recorded_by.username", read_only=True
    )
    allocations = DebtPaymentAllocationSerializer(many=True, read_only=True)

    class Meta:
        model = DebtPayment
        fields = [
            "id",
            "customer",
            "customer_name",
            "amount",
            "method",
            "card_bank",
            "note",
            "recorded_by",
            "recorded_by_username",
            "created_at",
            "allocations",
        ]
