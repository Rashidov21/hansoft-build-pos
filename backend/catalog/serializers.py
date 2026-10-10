from decimal import Decimal

from rest_framework import serializers

from .models import (
    Category,
    ProductCategory,
    Product,
    ProductVariant,
    Supplier,
    SupplierTransaction,
    ProductSpecification,
)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name_uz", "name_ru", "sort_order", "deleted_at"]


class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = ["id", "name_uz", "name_ru", "sort_order", "deleted_at", "created_at", "updated_at"]


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            "id",
            "category",
            "product_category",
            "name_uz",
            "name_ru",
            "name_uz_cyrillic",
            "custom_name_uz",
            "custom_name_ru",
            "custom_name_uz_cyrillic",
            "is_active",
            "deleted_at",
            "created_at",
            "updated_at",
        ]


class ProductVariantSerializer(serializers.ModelSerializer):
    """Full product variant serializer for admin/owner catalog management."""
    product_name_uz = serializers.CharField(source="product.name_uz", read_only=True)
    product_name_ru = serializers.CharField(source="product.name_ru", read_only=True)
    product_name_uz_cyrillic = serializers.CharField(
        source="product.name_uz_cyrillic", read_only=True, required=False, allow_null=True
    )
    product_custom_name_uz = serializers.CharField(source="product.custom_name_uz", read_only=True, required=False)
    product_custom_name_ru = serializers.CharField(source="product.custom_name_ru", read_only=True, required=False)
    product_custom_name_uz_cyrillic = serializers.CharField(
        source="product.custom_name_uz_cyrillic", read_only=True, required=False, allow_null=True
    )
    category_name_uz = serializers.CharField(source="product.category.name_uz", read_only=True)
    category_name_ru = serializers.CharField(source="product.category.name_ru", read_only=True)
    product_category_id = serializers.UUIDField(source="product.product_category.id", read_only=True, required=False, allow_null=True)
    product_category_name_uz = serializers.CharField(source="product.product_category.name_uz", read_only=True, required=False, allow_null=True)
    product_category_name_ru = serializers.CharField(source="product.product_category.name_ru", read_only=True, required=False, allow_null=True)
    last_received_at = serializers.DateTimeField(read_only=True, required=False, allow_null=True)

    class Meta:
        model = ProductVariant
        fields = [
            "id",
            "product",
            "product_name_uz",
            "product_name_ru",
            "product_name_uz_cyrillic",
            "product_custom_name_uz",
            "product_custom_name_ru",
            "product_custom_name_uz_cyrillic",
            "category_name_uz",
            "category_name_ru",
            "product_category_id",
            "product_category_name_uz",
            "product_category_name_ru",
            "unit",
            "barcode",
            "purchase_price",
            "list_price",
            "wholesale_price",
            "stock_qty",
            "show_price_on_label",
            "hide_selling_price",
            "is_active",
            "deleted_at",
            "created_at",
            "updated_at",
            "last_received_at",
        ]
        extra_kwargs = {
            "purchase_price": {"min_value": Decimal("0")},
            "list_price": {"min_value": Decimal("0"), "allow_null": True},
            "wholesale_price": {"min_value": Decimal("0"), "allow_null": True},
        }

    def update(self, instance, validated_data):
        # Stock is ledger-driven and must not be mutated from catalog edits.
        validated_data.pop("stock_qty", None)
        return super().update(instance, validated_data)


def _stock_row_show_purchase_price(request) -> bool:
    if not request or not getattr(request, "user", None) or not request.user.is_authenticated:
        return False
    from accounts.models import Role
    from accounts.views import _resolve_role

    return _resolve_role(request.user) in (Role.OWNER, Role.ADMIN)


class CashierStockRowSerializer(serializers.ModelSerializer):
    """Read-only catalog row for stock list; purchase_price only for owner/admin."""

    product_name_uz = serializers.CharField(source="product.name_uz", read_only=True)
    product_name_ru = serializers.CharField(source="product.name_ru", read_only=True)
    product_custom_name_uz = serializers.CharField(source="product.custom_name_uz", read_only=True, required=False, allow_null=True)
    product_custom_name_ru = serializers.CharField(source="product.custom_name_ru", read_only=True, required=False, allow_null=True)
    category_name_uz = serializers.CharField(source="product.category.name_uz", read_only=True)
    category_name_ru = serializers.CharField(source="product.category.name_ru", read_only=True)
    last_received_at = serializers.DateTimeField(read_only=True, required=False, allow_null=True)

    class Meta:
        model = ProductVariant
        fields = [
            "id",
            "product",
            "product_name_uz",
            "product_name_ru",
            "product_custom_name_uz",
            "product_custom_name_ru",
            "category_name_uz",
            "category_name_ru",
            "unit",
            "barcode",
            "list_price",
            "wholesale_price",
            "purchase_price",
            "stock_qty",
            "is_active",
            "last_received_at",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if not _stock_row_show_purchase_price(request):
            data.pop("purchase_price", None)
        return data


class PosProductVariantSerializer(serializers.ModelSerializer):
    """POS: purchase_price only for owner/admin (cashiers never see it)."""

    product_name_uz = serializers.CharField(source="product.name_uz", read_only=True)
    product_name_ru = serializers.CharField(source="product.name_ru", read_only=True)
    product_name_uz_cyrillic = serializers.CharField(
        source="product.name_uz_cyrillic", read_only=True, required=False, allow_null=True
    )
    product_custom_name_uz = serializers.CharField(source="product.custom_name_uz", read_only=True, required=False, allow_null=True)
    product_custom_name_ru = serializers.CharField(source="product.custom_name_ru", read_only=True, required=False, allow_null=True)
    product_custom_name_uz_cyrillic = serializers.CharField(
        source="product.custom_name_uz_cyrillic", read_only=True, required=False, allow_null=True
    )
    category_name_uz = serializers.CharField(source="product.category.name_uz", read_only=True)
    category_name_ru = serializers.CharField(source="product.category.name_ru", read_only=True)

    class Meta:
        model = ProductVariant
        fields = [
            "id",
            "product",
            "product_name_uz",
            "product_name_ru",
            "product_name_uz_cyrillic",
            "product_custom_name_uz",
            "product_custom_name_ru",
            "product_custom_name_uz_cyrillic",
            "category_name_uz",
            "category_name_ru",
            "unit",
            "barcode",
            "list_price",
            "wholesale_price",
            "purchase_price",
            "stock_qty",
            "is_active",
            "deleted_at",
            "hide_selling_price",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if not _stock_row_show_purchase_price(request):
            data.pop("purchase_price", None)
        return data


class SimpleBulkCreateSerializer(serializers.Serializer):
    """Simplified create for catalog SKUs."""
    product_id = serializers.UUIDField()
    purchase_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    list_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0")
    )
    wholesale_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0")
    )
    initial_qty = serializers.DecimalField(
        max_digits=12, decimal_places=3, required=False, default=Decimal("0"), min_value=Decimal("0")
    )
    barcode = serializers.CharField(max_length=64, required=False, allow_blank=True)
    unit = serializers.ChoiceField(
        choices=["dona", "kg", "m", "qop"], required=False, default="dona"
    )


class BulkGridCellSerializer(serializers.Serializer):
    """One SKU row: prices, qty, unit, optional barcode."""
    purchase_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    list_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0")
    )
    wholesale_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0")
    )
    initial_qty = serializers.DecimalField(
        max_digits=12, decimal_places=3, required=False, default=Decimal("0"), min_value=Decimal("0")
    )
    barcode = serializers.CharField(max_length=64, required=False, allow_blank=True)
    unit = serializers.ChoiceField(
        choices=["dona", "kg", "m", "qop"], required=False, default="dona"
    )


class BulkGridSerializer(serializers.Serializer):
    """Create one or more variants for a product."""
    product_id = serializers.UUIDField()
    matrix = BulkGridCellSerializer(many=True)

    def validate_matrix(self, value):
        seen_barcodes: set[str] = set()
        for row in value:
            barcode = (row.get("barcode") or "").strip()
            if barcode:
                if barcode in seen_barcodes:
                    raise serializers.ValidationError("Duplicate barcode in matrix payload")
                seen_barcodes.add(barcode)
        return value


class PosPriceUpdateSerializer(serializers.Serializer):
    list_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))


class SupplierSerializer(serializers.ModelSerializer):
    """Supplier management for accounts payable tracking."""
    
    class Meta:
        model = Supplier
        fields = [
            "id",
            "name_uz",
            "name_ru",
            "contact_person",
            "phone",
            "email",
            "address",
            "is_active",
            "created_at",
            "updated_at",
        ]


class SupplierTransactionSerializer(serializers.ModelSerializer):
    """Track individual supplier transactions for debt/credit."""
    
    supplier_id = serializers.UUIDField(source="supplier.id", read_only=True)
    supplier_name_uz = serializers.CharField(source="supplier.name_uz", read_only=True)
    supplier_name_ru = serializers.CharField(source="supplier.name_ru", read_only=True)
    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True, allow_null=True)

    class Meta:
        model = SupplierTransaction
        fields = [
            "id",
            "supplier",
            "supplier_id",
            "supplier_name_uz",
            "supplier_name_ru",
            "type",
            "amount",
            "description_uz",
            "description_ru",
            "note",
            "recorded_by",
            "recorded_by_username",
            "created_at",
        ]
        read_only_fields = ["supplier", "recorded_by", "recorded_by_username", "supplier_id", "supplier_name_uz", "supplier_name_ru", "id", "created_at"]


class SupplierBalanceSerializer(serializers.Serializer):
    """Read-only: supplier balance summary."""
    
    supplier_id = serializers.UUIDField()
    supplier_name_uz = serializers.CharField()
    supplier_name_ru = serializers.CharField()
    total_debt = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_paid = serializers.DecimalField(max_digits=14, decimal_places=2)  # renamed from total_credit
    balance = serializers.DecimalField(max_digits=14, decimal_places=2)  # debt - credit


class ProductSpecificationSerializer(serializers.ModelSerializer):
    """Product specifications for appliances (capacity, power, dimensions, etc.)."""
    
    product_name_uz = serializers.CharField(source="product.name_uz", read_only=True)
    product_name_ru = serializers.CharField(source="product.name_ru", read_only=True)

    class Meta:
        model = ProductSpecification
        fields = [
            "id",
            "product",
            "product_name_uz",
            "product_name_ru",
            "capacity",
            "power_consumption",
            "voltage",
            "dimensions",
            "weight",
            "color_options",
            "energy_class",
            "additional_specs",
            "created_at",
            "updated_at",
        ]


class SupplierReceiptLineInSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    qty = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2)


class SupplierReceiptCreateSerializer(serializers.Serializer):
    lines = SupplierReceiptLineInSerializer(many=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")
    create_purchase_debt = serializers.BooleanField(required=False, default=True)
