from typing import Literal, Optional

from .errors import NotFoundError
from .http import PagouHttpClient
from .types import TERMINAL_PAID_STATUSES

FulfillmentDecision = Literal["fulfill", "wait", "cancel"]

# Terminal failure/cancel states: stop waiting, release the order.
_TERMINAL_FAILED = frozenset({"canceled", "expired", "refused"})


def decide_fulfillment(status: str) -> FulfillmentDecision:
    """Maps a transaction status to a business decision. Never fulfill on a pending state."""
    if status in TERMINAL_PAID_STATUSES:
        return "fulfill"
    if status in _TERMINAL_FAILED:
        return "cancel"
    return "wait"


def reconcile_transaction(
    transaction_id: str, client: Optional[PagouHttpClient] = None
) -> Optional[dict]:
    """Server-side reconciliation: fetch the transaction from the API (the source
    of truth) and decide whether to fulfill.

    Business state changes only on this confirmed result, never on an unverified
    webhook body. Returns ``{"transaction": ..., "decision": ...}`` or ``None``.
    """
    client = client or PagouHttpClient()
    try:
        transaction = client.request_data("GET", f"/v2/transactions/{transaction_id}").data
        return {"transaction": transaction, "decision": decide_fulfillment(transaction["status"])}
    except NotFoundError:
        return None
