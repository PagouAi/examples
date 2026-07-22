# Parsing for the three webhook envelope families. The public contract exposes
# no signature header, so authenticity is established downstream by reconciling
# against the API — never by trusting these bodies. Every family carries a
# top-level `id` that is THE dedupe key (a resource emits many events over
# time, so deduping by resource id would drop distinct events).

from dataclasses import dataclass
from typing import Any, Literal, Optional, Union

WebhookFamily = Literal["transaction", "subscription", "transfer"]


@dataclass
class WebhookEvent:
    id: str  # Top-level event id — the idempotency/dedupe key.
    family: WebhookFamily
    event_type: str  # Concrete event name, e.g. `transaction.paid` or `payout.transferred`.
    resource_id: str  # Public id of the affected resource, used to reconcile against the API.
    raw: Any


@dataclass
class ParseFailure:
    error: Literal["missing_event_id", "unknown_envelope"]


def _as_record(value: Any) -> Optional[dict]:
    return value if isinstance(value, dict) else None


def parse_webhook(body: Any) -> Union[WebhookEvent, ParseFailure]:
    """Routes a raw webhook body to one of the three families and extracts the
    dedupe id, event type and resource id.

    Returns a typed failure instead of raising so the server can answer with the
    documented error body.
    """
    envelope = _as_record(body)
    if envelope is None:
        return ParseFailure(error="unknown_envelope")

    event_id = envelope["id"] if isinstance(envelope.get("id"), str) else None
    if not event_id:
        return ParseFailure(error="missing_event_id")

    # Transactions: envelope `event = "transaction"`, name in `data.event_type`.
    if envelope.get("event") == "transaction":
        data = _as_record(envelope.get("data")) or {}
        return WebhookEvent(
            id=event_id,
            family="transaction",
            event_type=str(data.get("event_type", "transaction.unknown")),
            resource_id=str(data.get("id", "")),
            raw=body,
        )

    # Subscriptions: envelope `event = "subscription"`, name in `data.event_type`.
    if envelope.get("event") == "subscription":
        data = _as_record(envelope.get("data")) or {}
        return WebhookEvent(
            id=event_id,
            family="subscription",
            event_type=str(data.get("event_type", "subscription.unknown")),
            resource_id=str(data.get("id", "")),
            raw=body,
        )

    # Transfers: top-level `type`, resource in `data.object`.
    if isinstance(envelope.get("type"), str):
        data = _as_record(envelope.get("data")) or {}
        obj = _as_record(data.get("object")) or {}
        return WebhookEvent(
            id=event_id,
            family="transfer",
            event_type=envelope["type"],
            resource_id=str(obj.get("id", "")),
            raw=body,
        )

    return ParseFailure(error="unknown_envelope")


# Event types that assert a confirmed, fulfillable state change.
_CONFIRMED_EVENTS = frozenset(
    {
        "transaction.paid",
        "transaction.refunded",
        "transaction.partially_refunded",
        "transaction.chargedback",
        "subscription.renewed",
        "subscription.payment_failed",
        "subscription.past_due",
        "subscription.canceled",
        "payout.transferred",
        "payout.failed",
        "payout.rejected",
        "payout.canceled",
    }
)


def is_confirmed_state_change(event_type: str) -> bool:
    """Whether an event should trigger reconciliation + a business-state change."""
    return event_type in _CONFIRMED_EVENTS
