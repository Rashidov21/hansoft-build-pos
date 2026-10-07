from decimal import Decimal

from django.utils import timezone
from django.db import transaction
from django.db.models import F

from catalog.models import ProductVariant
from core.audit import log_audit
from core.qty import parse_qty

from .models import InventoryMovement, StocktakeLine, StocktakeSession


@transaction.atomic
def apply_movement(
    *,
    variant: ProductVariant,
    qty_delta,
    movement_type: str,
    user,
    note: str = "",
    ref_sale=None,
) -> InventoryMovement:
    """Adjust stock_qty and append ledger row (same transaction)."""
    qty_delta = parse_qty(qty_delta)
    if qty_delta == 0:
        raise ValueError("qty_delta cannot be 0")

    if qty_delta < 0:
        updated = ProductVariant.objects.filter(
            pk=variant.pk,
            stock_qty__gte=abs(qty_delta),
        ).update(stock_qty=F("stock_qty") + qty_delta)
        if updated != 1:
            from core.exceptions import InsufficientStock

            raise InsufficientStock("Insufficient stock for movement")
    else:
        ProductVariant.objects.filter(pk=variant.pk).update(
            stock_qty=F("stock_qty") + qty_delta
        )

    variant.refresh_from_db()
    return InventoryMovement.objects.create(
        variant=variant,
        type=movement_type,
        qty_delta=qty_delta,
        ref_sale=ref_sale,
        note=note,
        user=user,
    )


@transaction.atomic
def create_stocktake_session(*, user, note: str = "") -> StocktakeSession:
    session = StocktakeSession.objects.create(
        created_by=user,
        note=note or "",
        status=StocktakeSession.Status.OPEN,
    )
    variants = ProductVariant.objects.filter(is_active=True, deleted_at__isnull=True)
    StocktakeLine.objects.bulk_create(
        [
            StocktakeLine(
                session=session,
                variant=v,
                expected_qty=v.stock_qty,
                counted_qty=None,
                variance_qty=Decimal("0"),
            )
            for v in variants
        ]
    )
    log_audit(
        event_type="stocktake_created",
        actor=getattr(user, "username", None),
        entity_id=str(session.id),
        payload={"line_count": session.lines.count(), "note": session.note},
    )
    return session


@transaction.atomic
def set_stocktake_count(
    *, session: StocktakeSession, variant: ProductVariant, counted_qty, user
):
    if session.status != StocktakeSession.Status.OPEN:
        raise ValueError("Stocktake session already applied")
    counted_qty = parse_qty(counted_qty)
    line = StocktakeLine.objects.get(session=session, variant=variant)
    line.counted_qty = counted_qty
    line.variance_qty = parse_qty(counted_qty - line.expected_qty)
    line.save(update_fields=["counted_qty", "variance_qty"])
    log_audit(
        event_type="stocktake_counted",
        actor=getattr(user, "username", None),
        entity_id=str(session.id),
        payload={
            "variant_id": str(variant.id),
            "counted_qty": str(counted_qty),
            "expected_qty": str(line.expected_qty),
            "variance_qty": str(line.variance_qty),
        },
    )
    return line


@transaction.atomic
def apply_stocktake(*, session: StocktakeSession, user):
    if session.status != StocktakeSession.Status.OPEN:
        raise ValueError("Stocktake session already applied")
    for line in session.lines.select_related("variant").all():
        if line.counted_qty is None:
            continue
        current_qty = line.variant.stock_qty
        # Apply against current stock to avoid drift from intervening sales.
        delta = parse_qty(line.counted_qty - current_qty)
        if delta == 0:
            continue
        apply_movement(
            variant=line.variant,
            qty_delta=delta,
            movement_type=InventoryMovement.Type.ADJUST,
            user=user,
            note=f"Stocktake adjust session={session.id}",
        )
    session.status = StocktakeSession.Status.APPLIED
    session.applied_at = timezone.now()
    session.save(update_fields=["status", "applied_at"])
    log_audit(
        event_type="stocktake_applied",
        actor=getattr(user, "username", None),
        entity_id=str(session.id),
        payload={"applied_at": session.applied_at.isoformat()},
    )
    return session
