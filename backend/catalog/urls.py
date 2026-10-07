from django.urls import path

from . import views

urlpatterns = [
    path("categories/", views.CategoryListCreate.as_view()),
    path("categories/<uuid:pk>/", views.CategoryDetail.as_view()),
    path("product-categories/", views.ProductCategoryListCreate.as_view()),
    path("product-categories/<uuid:pk>/", views.ProductCategoryDetail.as_view()),
    path("products/", views.ProductListCreate.as_view()),
    path("products/<uuid:pk>/", views.ProductDetail.as_view()),
    path("variants/cashier-stock/", views.CashierStockListView.as_view()),
    path("variants/", views.ProductVariantListCreate.as_view()),
    path("variants/<uuid:pk>/", views.ProductVariantDetail.as_view()),
    path("variants/<uuid:pk>/pos-price/", views.PosVariantPriceView.as_view()),
    path("variants/by-barcode/", views.VariantByBarcodeView.as_view()),
    path("variants/pos-search/", views.PosVariantSearchView.as_view()),
    path("variants/pos-by-product/", views.PosVariantByProductView.as_view()),
    path("variants/bulk-grid/", views.BulkVariantGridView.as_view()),
    # Low stock endpoints
    path("low-stock/", views.LowStockListView.as_view()),
    path("low-stock/by-brand/", views.LowStockByBrandView.as_view()),
    path("low-stock/by-model/", views.LowStockByModelView.as_view()),
    # Supplier management endpoints
    path("suppliers/", views.SupplierListCreateView.as_view()),
    path("suppliers/<uuid:pk>/", views.SupplierDetailView.as_view()),
    path("suppliers/balances/", views.SupplierBalanceView.as_view()),
    path("suppliers/<uuid:supplier_id>/balance/", views.SingleSupplierBalanceView.as_view()),
    path("suppliers/<uuid:supplier_id>/transactions/", views.SupplierTransactionListView.as_view()),
    path("suppliers/transactions/<uuid:pk>/void/", views.SupplierTransactionVoidView.as_view()),
    path("suppliers/<uuid:supplier_id>/receipts/", views.SupplierReceiptListCreateView.as_view()),
    path("suppliers/receipts/<uuid:receipt_id>/pdf/", views.SupplierReceiptPdfView.as_view()),
    path("categories/<uuid:pk>/restore/", views.CategoryRestoreView.as_view()),
    path("product-categories/<uuid:pk>/restore/", views.ProductCategoryRestoreView.as_view()),
    path("products/<uuid:pk>/restore/", views.ProductRestoreView.as_view()),
    path("variants/<uuid:pk>/restore/", views.ProductVariantRestoreView.as_view()),
    # Phase 4: Product Specifications endpoints
    path("products/<uuid:product_id>/specifications/", views.ProductSpecificationView.as_view()),
    path("specifications/", views.ProductSpecificationListView.as_view()),
    path("specifications/summary/", views.SpecificationSummaryView.as_view()),
    path("products/without-specs/", views.ProductsWithoutSpecsView.as_view()),
]
