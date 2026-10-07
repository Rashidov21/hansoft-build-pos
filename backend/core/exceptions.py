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


class BarcodeNotFound(DomainError):
    code = "BARCODE_NOT_FOUND"
    status_code = 404


class IdempotencyInProgress(DomainError):
    code = "IDEMPOTENCY_IN_PROGRESS"
    status_code = 409
