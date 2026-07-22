from typing import Optional

from handlers import WebhookEvent, is_confirmed_state_change
from store import set_resource_state

from pagou.errors import NotFoundError
from pagou.http import PagouHttpClient
from pagou.logger import logger

_RESOURCE_PATH = {
    "transaction": "/v2/transactions",
    "subscription": "/v2/subscriptions",
    "transfer": "/v2/transfers",
}


def process_event(event: WebhookEvent, client: Optional[PagouHttpClient] = None) -> None:
    """The offloaded, slow half of webhook handling. It runs AFTER the fast 2xx ack.

    Business state changes only on a confirmed event, and only after reconciling
    against the API — the webhook body is a hint, the API is the source of truth.
    """
    if not is_confirmed_state_change(event.event_type):
        logger.info(f"Ignoring non-confirming event {event.event_type} ({event.id})")
        return
    if not event.resource_id:
        logger.warn(f"Confirmed event {event.event_type} without a resource id — cannot reconcile.")
        return

    client = client or PagouHttpClient()
    try:
        data = client.request_data(
            "GET", f"{_RESOURCE_PATH[event.family]}/{event.resource_id}"
        ).data
        set_resource_state(event.resource_id, data["status"])
        logger.info(f"Reconciled {event.family} {event.resource_id} → {data['status']}")
    except NotFoundError:
        logger.warn(f"Resource {event.resource_id} not found during reconciliation.")
    except Exception as error:  # noqa: BLE001 - reference requeues on any transient failure
        # Reconciliation failed after the ack: a real system would requeue this
        # event for a later retry rather than replaying side effects.
        logger.error(f"Reconciliation failed for {event.id}", {"message": str(error)})
        raise
