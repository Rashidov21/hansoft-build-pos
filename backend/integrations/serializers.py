from rest_framework import serializers

from .models import IntegrationSettings, ReportChannel, ReportRoute


class IntegrationSettingsSerializer(serializers.ModelSerializer):
    @staticmethod
    def _mask_secret(value: str) -> str:
        raw = (value or "").strip()
        if not raw:
            return ""
        if len(raw) <= 4:
            return "*" * len(raw)
        return f"{'*' * (len(raw) - 4)}{raw[-4:]}"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for key in [
            "telegram_bot_token",
            "whatsapp_api_token",
            "greenapi_api_token_instance",
        ]:
            data[key] = self._mask_secret(data.get(key, ""))
        return data

    def update(self, instance, validated_data):
        # Ignore masked placeholders coming back from frontend.
        for key in [
            "telegram_bot_token",
            "whatsapp_api_token",
            "greenapi_api_token_instance",
        ]:
            value = validated_data.get(key)
            if isinstance(value, str) and "*" in value:
                validated_data.pop(key, None)
        return super().update(instance, validated_data)

    class Meta:
        model = IntegrationSettings
        fields = [
            "telegram_bot_token",
            "telegram_chat_id",
            "whatsapp_provider",
            "whatsapp_api_base",
            "whatsapp_api_token",
            "whatsapp_sender",
            "greenapi_instance_id",
            "greenapi_api_token_instance",
            "primary_report_channel",
            "report_lang",
            "auto_daily_z_report_enabled",
            "auto_low_stock_report_enabled",
            "telegram_db_backup_interval_days",
            "auto_debt_whatsapp_reminder_enabled",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def validate_report_lang(self, value):
        raw = (value or "").strip().lower()
        if not raw:
            return ""
        if raw in ("uz", "ru", "uz-cyrl", "uz_cyrl"):
            return "uz-cyrl" if raw in ("uz-cyrl", "uz_cyrl") else raw
        raise serializers.ValidationError("report_lang must be uz, ru, uz-cyrl, or empty.")

    def validate_telegram_db_backup_interval_days(self, value):
        try:
            days = int(value)
        except (TypeError, ValueError):
            raise serializers.ValidationError("Invalid interval.")
        if days not in (0, 1, 3):
            raise serializers.ValidationError("telegram_db_backup_interval_days must be 0, 1, or 3.")
        return days


class ReportChannelSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportChannel
        fields = [
            "id",
            "name",
            "kind",
            "address",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_kind(self, value):
        raw = (value or "").strip().lower()
        if raw not in (ReportChannel.Kind.TELEGRAM, ReportChannel.Kind.WHATSAPP):
            raise serializers.ValidationError("kind must be telegram or whatsapp")
        return raw

    def validate_address(self, value):
        raw = (value or "").strip()
        if not raw:
            raise serializers.ValidationError("address is required")
        return raw


class ReportRouteSerializer(serializers.ModelSerializer):
    channel_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False,
    )
    channels = ReportChannelSerializer(many=True, read_only=True)

    class Meta:
        model = ReportRoute
        fields = [
            "id",
            "report_type",
            "enabled",
            "channels",
            "channel_ids",
            "updated_at",
        ]
        read_only_fields = ["id", "report_type", "channels", "updated_at"]

    def update(self, instance, validated_data):
        channel_ids = validated_data.pop("channel_ids", None)
        instance = super().update(instance, validated_data)
        if channel_ids is not None:
            qs = ReportChannel.objects.filter(id__in=channel_ids)
            instance.channels.set(qs)
        return instance
