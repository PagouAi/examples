# In-memory persistence stand-ins. A real integration would back these with a
# database: the processed-events table gives idempotency across redeliveries,
# and the business-state table is the record you actually fulfill against.

from typing import Optional

_processed_events: set[str] = set()
_business_state: dict[str, str] = {}


def mark_processed(event_id: str) -> bool:
    """True the first time an event id is seen; False for any redelivery."""
    if event_id in _processed_events:
        return False
    _processed_events.add(event_id)
    return True


def has_processed(event_id: str) -> bool:
    return event_id in _processed_events


def set_resource_state(resource_id: str, state: str) -> None:
    """Records the reconciled state of a resource (the fulfillable source of truth)."""
    _business_state[resource_id] = state


def get_resource_state(resource_id: str) -> Optional[str]:
    return _business_state.get(resource_id)


def reset_store() -> None:
    """Test/support helper to reset the in-memory stores."""
    _processed_events.clear()
    _business_state.clear()
