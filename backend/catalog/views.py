from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError
from django.db import transaction
from django.db.models import F, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone
import logging

from core.audit import log_audit
from core.permissions import IsAdminOrOwner, IsCashier

from .models import Category, ProductCategory, Product, ProductVariant, Supplier, SupplierTransaction
from .serializers import (
    BulkGridSerializer,
    CashierStockRowSerializer,
    CategorySerializer,
    ProductCategorySerializer,
    PosPriceUpdateSerializer,
    PosProductVariantSerializer,
    ProductSerializer,
    ProductVariantSerializer,
    SupplierSerializer,
    SupplierTransactionSerializer,
)
from .search import variant_text_search_q
from .services import bulk_create_variant_grid
from inventory.models import InventoryMovement


def _annotate_variant_last_received(qs):
    """Last IN movement time, or variant created_at when no stock receipt exists."""
    last_in_movement_created_at = Subquery(
        InventoryMovement.objects.filter(
            variant_id=OuterRef("pk"),
            type=InventoryMovement.Type.IN,
            qty_delta__gt=0,
            reversed_at__isnull=True,
        )
        .order_by("-created_at")
        .values("created_at")[:1]
    )
    return qs.annotate(last_received_at=Coalesce(last_in_movement_created_at, F("created_at")))


def _apply_variant_visibility(qs, *, include_deleted: bool = False):
    """Hide soft-deleted variants and variants whose product was soft-deleted."""
    if not include_deleted:
        qs = qs.filter(deleted_at__isnull=True, product__deleted_at__isnull=True)
    return qs


def _soft_delete_product_with_variants(product: Product) -> None:
    now = timezone.now()
    with transaction.atomic():
        product.deleted_at = now
        product.save(update_fields=["deleted_at"])
        product.variants.filter(deleted_at__isnull=True).update(deleted_at=now)


def _restore_product_with_variants(product: Product) -> Product:
    if not product.deleted_at:
        return product
    deleted_at = product.deleted_at
    with transaction.atomic():
        product.deleted_at = None
        product.save(update_fields=["deleted_at"])
        ProductVariant.objects.filter(product=product, deleted_at=deleted_at).update(deleted_at=None)
    return product


class CatalogPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200


class CategoryListCreate(generics.ListCreateAPIView):
    queryset = Category.objects.filter(deleted_at__isnull=True)
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]


class CategoryDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at"])


class ProductCategoryListCreate(generics.ListCreateAPIView):
    queryset = ProductCategory.objects.filter(deleted_at__isnull=True)
    serializer_class = ProductCategorySerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    pagination_class = None  # No pagination for product categories


class ProductCategoryDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = ProductCategory.objects.all()
    serializer_class = ProductCategorySerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at"])


class ProductListCreate(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    pagination_class = CatalogPagination

    def get_queryset(self):
        include_deleted = self.request.query_params.get("include_deleted") == "1"
        query = (self.request.query_params.get("q") or "").strip()
        qs = Product.objects.all()
        if not include_deleted:
            qs = qs.filter(deleted_at__isnull=True)
        if query:
            qs = qs.filter(Q(name_uz__icontains=query) | Q(name_ru__icontains=query))
        cat_id = (self.request.query_params.get("category_id") or "").strip()
        if cat_id:
            qs = qs.filter(category_id=cat_id)
        return qs.order_by("name_uz")


class CashierStockListView(generics.ListAPIView):
    """Paginated variants for cashiers (read-only, no purchase_price); inactive rows included."""

    serializer_class = CashierStockRowSerializer
    permission_classes = [IsAuthenticated, IsCashier]
    pagination_class = CatalogPagination

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "request": self.request}

    def get_queryset(self):
        query = (self.request.query_params.get("q") or "").strip()
        qs = ProductVariant.objects.select_related("product", "product__category")
        qs = _apply_variant_visibility(qs, include_deleted=False)
        if query:
            qs = qs.filter(variant_text_search_q(query))
        qs = _annotate_variant_last_received(qs)
        return qs.order_by("product__name_uz", "barcode")


class ProductVariantListCreate(generics.ListCreateAPIView):
    serializer_class = ProductVariantSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    pagination_class = CatalogPagination

    def get_queryset(self):
        include_deleted = self.request.query_params.get("include_deleted") == "1"
        query = (self.request.query_params.get("q") or "").strip()
        qs = ProductVariant.objects.select_related("product", "product__category")
        qs = _apply_variant_visibility(qs, include_deleted=include_deleted)
        if query:
            qs = qs.filter(variant_text_search_q(query))

        cat_id = (self.request.query_params.get("category_id") or "").strip()
        prod_id = (self.request.query_params.get("product_id") or "").strip()
        if cat_id:
            qs = qs.filter(product__category_id=cat_id)
        if prod_id:
            qs = qs.filter(product_id=prod_id)

        qs = _annotate_variant_last_received(qs)

        ordering_param = (self.request.query_params.get("ordering") or "name").strip().lower()
        if ordering_param == "recent":
            return qs.order_by("-created_at", "-id")
        return qs.order_by("product__name_uz", "barcode")


class VariantByBarcodeView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def get(self, request):
        code = (request.query_params.get("code") or "").strip()
        if not code:
            return Response({"code": "BARCODE_EMPTY"}, status=400)
        v = (
            ProductVariant.objects.select_related("product", "product__category")
            .filter(barcode=code, is_active=True)
            .filter(deleted_at__isnull=True, product__deleted_at__isnull=True)
            .first()
        )
        if not v:
            from core.exceptions import BarcodeNotFound

            return Response(
                {"code": BarcodeNotFound.code, "detail": "Barcode not found"},
                status=404,
            )
        return Response(PosProductVariantSerializer(v, context={"request": request}).data)


class PosVariantSearchView(APIView):
    """Text search for POS (cashier): name, brand/model via product, barcode."""

    permission_classes = [IsAuthenticated, IsCashier]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        if len(q) < 2:
            return Response({"results": []})
        limit = min(int(request.query_params.get("limit") or 30), 50)
        qs = (
            ProductVariant.objects.select_related("product", "product__category")
            .filter(is_active=True)
            .filter(deleted_at__isnull=True, product__deleted_at__isnull=True)
            .filter(variant_text_search_q(q))
            .order_by("product__name_uz", "barcode")[:limit]
        )
        return Response(
            {"results": PosProductVariantSerializer(qs, many=True, context={"request": request}).data}
        )


class PosVariantByProductView(APIView):
    """All active variants for a product — simplified for appliances (no color filter)."""

    permission_classes = [IsAuthenticated, IsCashier]

    def get(self, request):
        from uuid import UUID

        raw_pid = (request.query_params.get("product_id") or "").strip()
        if not raw_pid:
            return Response({"code": "PRODUCT_ID_REQUIRED"}, status=400)
        try:
            UUID(raw_pid)
        except ValueError:
            return Response({"code": "INVALID_PRODUCT_ID"}, status=400)
        
        if not Product.objects.filter(pk=raw_pid, deleted_at__isnull=True).exists():
            return Response({"results": []})
        qs = (
            ProductVariant.objects.select_related("product")
            .filter(product_id=raw_pid, is_active=True)
            .filter(deleted_at__isnull=True, product__deleted_at__isnull=True)
            .order_by("barcode")
        )
        return Response(
            {"results": PosProductVariantSerializer(qs, many=True, context={"request": request}).data}
        )


class BulkVariantGridView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request):
        ser = BulkGridSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            product = Product.objects.get(pk=ser.validated_data["product_id"])
        except Product.DoesNotExist:
            return Response({"code": "PRODUCT_NOT_FOUND", "detail": "Product not found."}, status=404)
        created = bulk_create_variant_grid(
            product=product,
            matrix=[dict(c) for c in ser.validated_data["matrix"]],
            user=request.user,
        )
        return Response(
            ProductVariantSerializer(created, many=True).data,
            status=status.HTTP_201_CREATED,
        )


class ProductDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        hard = request.query_params.get("hard") == "1"
        has_refs = instance.variants.filter(
            Q(sale_lines__isnull=False) | Q(movements__isnull=False) | Q(stocktake_lines__isnull=False)
        ).exists()
        if hard and not has_refs:
            instance.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        _soft_delete_product_with_variants(instance)
        return Response({"code": "SOFT_DELETED_REFERENCED" if has_refs else "SOFT_DELETED"}, status=200)


class ProductVariantDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = ProductVariant.objects.select_related("product")
    serializer_class = ProductVariantSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        hard = request.query_params.get("hard") == "1"
        has_refs = (
            instance.sale_lines.exists()
            or instance.movements.exists()
            or instance.stocktake_lines.exists()
        )
        if hard and not has_refs:
            instance.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at"])
        return Response({"code": "SOFT_DELETED_REFERENCED" if has_refs else "SOFT_DELETED"}, status=200)


class PosVariantPriceView(APIView):
    permission_classes = [IsAuthenticated, IsCashier]

    def post(self, request, pk):
        try:
            variant = ProductVariant.objects.select_related("product").get(pk=pk)
        except ProductVariant.DoesNotExist:
            return Response({"code": "VARIANT_NOT_FOUND", "detail": "Variant not found."}, status=404)
        ser = PosPriceUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        old_price = variant.list_price
        variant.list_price = ser.validated_data["list_price"]
        variant.save(update_fields=["list_price", "updated_at"])
        log_audit(
            event_type="pos_price_updated",
            actor=request.user.username if request.user else None,
            entity_id=str(variant.id),
            payload={
                "old_price": str(old_price),
                "new_price": str(variant.list_price),
                "product_name": variant.product.name_uz,
                "barcode": variant.barcode,
            },
        )
        return Response(ProductVariantSerializer(variant).data)


# ============================================================================
# Supplier Management Endpoints
# ============================================================================


class SupplierListCreateView(generics.ListCreateAPIView):
    """List all suppliers or create a new supplier."""
    queryset = Supplier.objects.filter(is_active=True).order_by("name_uz")
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    pagination_class = CatalogPagination


class SupplierDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or soft-delete a supplier."""
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    
    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()


class SupplierTransactionListView(generics.ListCreateAPIView):
    """List transactions for a supplier or record a new transaction."""
    serializer_class = SupplierTransactionSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    pagination_class = CatalogPagination
    
    def get_queryset(self):
        supplier_id = self.kwargs.get("supplier_id")
        return SupplierTransaction.objects.filter(
            supplier_id=supplier_id, voided_at__isnull=True
        ).order_by("-created_at")
    
    def perform_create(self, serializer):
        supplier_id = self.kwargs.get("supplier_id")
        try:
            supplier = Supplier.objects.get(id=supplier_id)
            serializer.save(supplier=supplier, recorded_by=self.request.user)
        except Supplier.DoesNotExist:
            raise ValidationError({"detail": f"Supplier with ID {supplier_id} not found"})
    
    def create(self, request, *args, **kwargs):
        """Override to provide better error messages."""
        try:
            return super().create(request, *args, **kwargs)
        except ValidationError as e:
            return Response({"code": "VALIDATION_ERROR", "detail": str(e)}, status=400)
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Error creating supplier transaction: {e}")
            return Response({"code": "TRANSACTION_ERROR", "detail": str(e)}, status=400)


class SupplierBalanceView(APIView):
    """Get balance summary for all suppliers."""
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    
    def get(self, request):
        from .supplier_services import get_all_suppliers_balance
        from .serializers import SupplierBalanceSerializer
        
        balances = get_all_suppliers_balance()
        serializer = SupplierBalanceSerializer(balances, many=True)
        return Response(serializer.data)


class SingleSupplierBalanceView(APIView):
    """Get balance for a specific supplier."""
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    
    def get(self, request, supplier_id):
        from .supplier_services import get_supplier_balance
        from .serializers import SupplierBalanceSerializer
        
        try:
            supplier = Supplier.objects.get(id=supplier_id)
        except Supplier.DoesNotExist:
            return Response({"code": "SUPPLIER_NOT_FOUND", "detail": "Supplier not found."}, status=404)
        
        balance_info = get_supplier_balance(supplier_id)
        data = {
            "supplier_id": supplier.id,
            "supplier_name_uz": supplier.name_uz,
            "supplier_name_ru": supplier.name_ru,
            **balance_info,
        }
        serializer = SupplierBalanceSerializer(data)
        return Response(serializer.data)


class LowStockListView(APIView):
    """Get all products with low stock, with optional filtering."""
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    
    def get(self, request):
        from .low_stock import get_low_stock_summary
        
        # Get aggregation type from query params
        aggregation = request.query_params.get("aggregation", "summary").lower()
        # summary, variants, by_brand, by_model
        
        summary = get_low_stock_summary()
        
        if aggregation == "variants":
            return Response({"results": summary["variants"]})
        elif aggregation == "by_brand":
            return Response({"results": summary["by_brand"]})
        elif aggregation == "by_model":
            return Response({"results": summary["by_model"]})
        else:
            # Default: summary
            return Response(summary)


class LowStockByBrandView(APIView):
    """Get low stock aggregated by brand (category)."""
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    
    def get(self, request):
        from .low_stock import get_low_stock_by_brand
        
        results = get_low_stock_by_brand()
        return Response({"results": results})


class LowStockByModelView(APIView):
    """Get low stock aggregated by model (product)."""
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    
    def get(self, request):
        from .low_stock import get_low_stock_by_model
        
        results = get_low_stock_by_model()
        return Response({"results": results})


# ============================================================================
# Phase 4: Product Specifications Endpoints
# ============================================================================


class ProductSpecificationView(APIView):
    """Get or update product specifications."""
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    
    def get(self, request, product_id):
        from .specification_services import get_specification
        from .serializers import ProductSpecificationSerializer
        
        spec = get_specification(product_id)
        if not spec:
            return Response({"code": "SPEC_NOT_FOUND", "detail": "Specifications not found."}, status=404)
        
        serializer = ProductSpecificationSerializer(spec)
        return Response(serializer.data)
    
    def put(self, request, product_id):
        from .specification_services import update_specification
        from .serializers import ProductSpecificationSerializer
        
        try:
            Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response({"code": "PRODUCT_NOT_FOUND", "detail": "Product not found."}, status=404)
        
        spec = update_specification(product_id, **request.data)
        serializer = ProductSpecificationSerializer(spec)
        
        log_audit(
            event_type="product_spec_updated",
            actor=request.user.username if request.user else None,
            entity_id=str(product_id),
            payload={"specifications": request.data},
        )
        
        return Response(serializer.data)
    
    def delete(self, request, product_id):
        from .specification_services import delete_specification
        
        deleted = delete_specification(product_id)
        if not deleted:
            return Response({"code": "SPEC_NOT_FOUND", "detail": "Specifications not found."}, status=404)
        
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductSpecificationListView(generics.ListAPIView):
    """List all product specifications."""
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    pagination_class = CatalogPagination
    
    def get(self, request):
        from .models import ProductSpecification
        from .serializers import ProductSpecificationSerializer
        
        qs = ProductSpecification.objects.select_related('product__category').order_by('product__name_uz')
        
        # Optional filters
        energy_class = request.query_params.get('energy_class')
        if energy_class:
            qs = qs.filter(energy_class__iexact=energy_class)
        
        capacity = request.query_params.get('capacity')
        if capacity:
            qs = qs.filter(capacity__icontains=capacity)
        
        serializer = ProductSpecificationSerializer(qs, many=True)
        return Response({"results": serializer.data})


class ProductsWithoutSpecsView(APIView):
    """Get all products that don't have specifications defined."""
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    
    def get(self, request):
        from .specification_services import get_products_without_specifications
        
        products = get_products_without_specifications()
        serializer = ProductSerializer(products, many=True)
        return Response({"results": serializer.data})


class SpecificationSummaryView(APIView):
    """Get summary statistics for product specifications."""
    permission_classes = [IsAuthenticated, IsAdminOrOwner]
    
    def get(self, request):
        from .specification_services import get_specification_summary
        
        summary = get_specification_summary()
        return Response(summary)


class SupplierTransactionVoidView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request, pk):
        try:
            tx = SupplierTransaction.objects.get(pk=pk, voided_at__isnull=True)
        except SupplierTransaction.DoesNotExist:
            return Response({"code": "TRANSACTION_NOT_FOUND"}, status=404)
        tx.voided_at = timezone.now()
        tx.voided_by = request.user
        tx.save(update_fields=["voided_at", "voided_by"])
        return Response({"ok": True, "id": str(tx.id)})


def _restore_soft_deleted(model, pk):
    try:
        obj = model.objects.get(pk=pk)
    except model.DoesNotExist:
        return None
    if not obj.deleted_at:
        return obj
    obj.deleted_at = None
    obj.save(update_fields=["deleted_at"])
    return obj


class CategoryRestoreView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request, pk):
        obj = _restore_soft_deleted(Category, pk)
        if not obj:
            return Response({"code": "NOT_FOUND"}, status=404)
        return Response(CategorySerializer(obj).data)


class ProductCategoryRestoreView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request, pk):
        obj = _restore_soft_deleted(ProductCategory, pk)
        if not obj:
            return Response({"code": "NOT_FOUND"}, status=404)
        return Response(ProductCategorySerializer(obj).data)


class ProductRestoreView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request, pk):
        try:
            product = Product.objects.get(pk=pk)
        except Product.DoesNotExist:
            return Response({"code": "NOT_FOUND"}, status=404)
        obj = _restore_product_with_variants(product)
        return Response(ProductSerializer(obj).data)


class ProductVariantRestoreView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def post(self, request, pk):
        obj = _restore_soft_deleted(ProductVariant, pk)
        if not obj:
            return Response({"code": "NOT_FOUND"}, status=404)
        return Response(ProductVariantSerializer(obj).data)


class SupplierReceiptListCreateView(APIView):
    """Postavshikdan tovar qabul — katalog variantlari."""

    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request, supplier_id):
        from .models import SupplierReceipt
        from .receipt_services import supplier_receipt_profit

        qs = (
            SupplierReceipt.objects.filter(supplier_id=supplier_id)
            .prefetch_related("lines__variant__product")
            .order_by("-received_at")[:50]
        )
        results = []
        for r in qs:
            lines_out = []
            for ln in r.lines.all():
                lines_out.append(
                    {
                        "id": str(ln.id),
                        "variant_id": str(ln.variant_id),
                        "product_name": ln.variant.product.name_uz,
                        "barcode": ln.variant.barcode or "",
                        "qty": ln.qty,
                        "unit_cost": str(ln.unit_cost),
                        "line_cost": str(ln.line_cost),
                    }
                )
            results.append(
                {
                    "id": str(r.id),
                    "received_at": r.received_at.isoformat() if r.received_at else None,
                    "note": r.note,
                    "total_cost": str(r.total_cost),
                    "lines": lines_out,
                }
            )
        profit = supplier_receipt_profit(supplier_id=str(supplier_id))
        return Response({"results": results, "profit": profit})

    def post(self, request, supplier_id):
        from .receipt_services import create_supplier_receipt
        from .serializers import SupplierReceiptCreateSerializer

        ser = SupplierReceiptCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        try:
            receipt = create_supplier_receipt(
                supplier_id=str(supplier_id),
                lines=[dict(x) for x in data["lines"]],
                user=request.user,
                note=data.get("note") or "",
                create_purchase_debt=data.get("create_purchase_debt", True),
            )
        except ValueError as e:
            return Response({"code": "VALIDATION_ERROR", "detail": str(e)}, status=400)
        except Exception as e:
            return Response({"code": "RECEIPT_ERROR", "detail": str(e)}, status=400)
        return Response(
            {
                "id": str(receipt.id),
                "total_cost": str(receipt.total_cost),
                "received_at": receipt.received_at.isoformat() if receipt.received_at else None,
            },
            status=201,
        )


class SupplierReceiptPdfView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get(self, request, receipt_id):
        from django.http import HttpResponse

        from .models import SupplierReceipt

        try:
            receipt = (
                SupplierReceipt.objects.select_related("supplier")
                .prefetch_related("lines__variant__product")
                .get(pk=receipt_id)
            )
        except SupplierReceipt.DoesNotExist:
            return Response({"code": "NOT_FOUND"}, status=404)

        lines_txt: list[str] = []
        lines_txt.append(f"Postavshik: {receipt.supplier.name_uz}")
        lines_txt.append(
            f"Sana: {receipt.received_at.strftime('%Y-%m-%d %H:%M') if receipt.received_at else '-'}"
        )
        lines_txt.append(f"Jami: {receipt.total_cost} som")
        lines_txt.append("")
        for ln in receipt.lines.all():
            lines_txt.append(
                f"- {ln.variant.product.name_uz}  x{ln.qty}  @ {ln.unit_cost} = {ln.line_cost}"
            )
        body = "\n".join(lines_txt)
        # Minimal single-page PDF (Helvetica)
        content = body.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = f"BT /F1 11 Tf 40 800 Td 14 TL ({content.split(chr(10))[0]}) Tj".encode()
        # Simpler: text download that browsers can print; also provide .txt
        # Build real minimal PDF with one text block
        pdf_lines = []
        y = 800
        for row in lines_txt:
            safe = row.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            pdf_lines.append(f"BT /F1 10 Tf 40 {y} Td ({safe[:110]}) Tj ET")
            y -= 14
            if y < 40:
                break
        content_stream = "\n".join(pdf_lines)
        objects = []
        objects.append("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
        objects.append("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n")
        objects.append(
            "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            "/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n"
        )
        objects.append(
            f"4 0 obj<< /Length {len(content_stream)} >>stream\n{content_stream}\nendstream\nendobj\n"
        )
        objects.append("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n")
        out = bytearray(b"%PDF-1.4\n")
        offsets = [0]
        for obj in objects:
            offsets.append(len(out))
            out.extend(obj.encode("latin-1", errors="replace"))
        xref_pos = len(out)
        out.extend(f"xref\n0 {len(offsets)}\n".encode())
        out.extend(b"0000000000 65535 f \n")
        for off in offsets[1:]:
            out.extend(f"{off:010d} 00000 n \n".encode())
        out.extend(
            f"trailer<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()
        )
        resp = HttpResponse(bytes(out), content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="receipt-{str(receipt.id)[:8]}.pdf"'
        return resp

