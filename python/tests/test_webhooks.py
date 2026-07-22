import json
from pathlib import Path

import pytest
from conftest import json_response

from handlers import ParseFailure, is_confirmed_state_change, parse_webhook
from processor import process_event
from store import get_resource_state, mark_processed, reset_store

from pagou.http import PagouHttpClient

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def _reset():
    reset_store()


# --- parse_webhook ---

def test_routes_transaction_family():
    event = parse_webhook({"id": "evt_1", "event": "transaction", "data": {"id": "tx_1", "event_type": "transaction.paid"}})
    assert event.family == "transaction"
    assert event.event_type == "transaction.paid"
    assert event.resource_id == "tx_1"
    assert event.id == "evt_1"


def test_routes_subscription_family():
    event = parse_webhook({"id": "evt_2", "event": "subscription", "data": {"id": "sub_1", "event_type": "subscription.renewed"}})
    assert event.family == "subscription"
    assert event.event_type == "subscription.renewed"
    assert event.resource_id == "sub_1"


def test_routes_transfer_family_via_type_and_object():
    event = parse_webhook({"id": "evt_3", "type": "payout.transferred", "data": {"object": {"id": "tr_1"}}})
    assert event.family == "transfer"
    assert event.event_type == "payout.transferred"
    assert event.resource_id == "tr_1"


def test_rejects_body_without_event_id():
    result = parse_webhook({"event": "transaction", "data": {}})
    assert isinstance(result, ParseFailure)
    assert result.error == "missing_event_id"


def test_parses_each_family_fixture():
    for name in ("webhook.transaction.json", "webhook.subscription.json", "webhook.transfer.json"):
        assert not isinstance(parse_webhook(load_fixture(name)), ParseFailure)


# --- is_confirmed_state_change ---

def test_confirmed_terminal_money_events():
    assert is_confirmed_state_change("transaction.paid") is True
    assert is_confirmed_state_change("payout.transferred") is True


def test_informational_events_are_not_confirming():
    assert is_confirmed_state_change("transaction.created") is False
    assert is_confirmed_state_change("subscription.trial_will_end") is False


# --- dedupe ---

def test_dedupe_returns_true_once_then_false():
    assert mark_processed("evt_x") is True
    assert mark_processed("evt_x") is False


# --- process_event ---

def _event(**kwargs):
    from handlers import WebhookEvent

    base = {"id": "evt", "family": "transaction", "event_type": "transaction.paid", "resource_id": "tx_1", "raw": {}}
    base.update(kwargs)
    return WebhookEvent(**base)


def test_reconciles_and_updates_state_on_confirmed_event(config, make_transport):
    transport = make_transport(json_response(200, {"success": True, "requestId": "r", "data": {"status": "paid"}}))
    client = PagouHttpClient(config, transport=transport)
    process_event(_event(id="evt_1", resource_id="tx_1"), client)
    assert transport.call_count == 1
    assert get_resource_state("tx_1") == "paid"


def test_does_not_reconcile_on_non_confirming_event(config, make_transport):
    transport = make_transport(json_response(200, {"success": True, "requestId": "r", "data": {"status": "x"}}))
    client = PagouHttpClient(config, transport=transport)
    process_event(_event(id="evt_2", event_type="transaction.created", resource_id="tx_2"), client)
    assert transport.call_count == 0
    assert get_resource_state("tx_2") is None


def test_skips_reconciliation_when_no_resource_id(config, make_transport):
    transport = make_transport(json_response(200, {"success": True, "requestId": "r", "data": {"status": "paid"}}))
    client = PagouHttpClient(config, transport=transport)
    process_event(_event(id="evt_3", resource_id=""), client)
    assert transport.call_count == 0


def test_leaves_state_unchanged_when_resource_not_found(config, make_transport):
    transport = make_transport(json_response(404, {"message": "not found"}))
    client = PagouHttpClient(config, transport=transport)
    process_event(_event(id="evt_4", family="transfer", event_type="payout.transferred", resource_id="tr_x"), client)
    assert get_resource_state("tr_x") is None
