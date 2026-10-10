class DomainError(Exception):
    code = "DOMAIN_ERROR"
    status_code = 400


class InsufficientStock(DomainError):
    code = "INSUFFICIENT_STOCK"
    status_code = 409


class InvalidPaymentSplit(DomainError):
    code = "INVALID_PAYMENT_SPLIT"
    status_code = 400


class DebtPolicyError(DomainError):
    code = "DEBT_POLICY_ERROR"
    status_code = 400


class BelowCostError(DomainError):
    """Admin/owner must confirm selling below purchase cost."""
    code = "BELOW_COST"
    status_code = 400


class PriceFloorError(DomainError):
    """Cashier cannot sell below catalog tier price."""
    code = "PRICE_BELOW_TIER"
    status_code = 400


class NoOpenShiftError(DomainError):
    """Sale requires an OPEN shift for the cashier."""
    code = "NO_OPEN_SHIFT"
    status_code = 400


class BarcodeNotFound(DomainError):
    code = "BARCODE_NOT_FOUND"
    status_code = 404


class IdempotencyInProgress(DomainError):
    code = "IDEMPOTENCY_IN_PROGRESS"
    status_code = 409
