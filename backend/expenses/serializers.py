from rest_framework import serializers

from .models import ShopExpense


class ShopExpenseSerializer(serializers.ModelSerializer):
    cashier_username = serializers.CharField(source="recorded_by.username", read_only=True)

    class Meta:
        model = ShopExpense
        fields = ["id", "recorded_at", "amount", "category", "note", "cashier_username", "recorded_by", "related_shift"]
        read_only_fields = ["id", "recorded_at", "cashier_username", "recorded_by"]

    def validate_amount(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("amount must be positive.")
        return value

    def create(self, validated_data):
        request = self.context["request"]
        validated_data["recorded_by"] = request.user
        # Ochiq smena bo'lsa avtomatik bog'lash (client yubormasa ham).
        if not validated_data.get("related_shift"):
            from .models import Shift

            open_shift = (
                Shift.objects.filter(cashier=request.user, status=Shift.Status.OPEN)
                .order_by("-opened_at")
                .first()
            )
            if open_shift:
                validated_data["related_shift"] = open_shift
        return super().create(validated_data)

