from conftest import json_response

from pagou.http import PagouHttpClient
from pagou.reconcile import decide_fulfillment, reconcile_transaction


def test_fulfills_only_on_settled_statuses():
    assert decide_fulfillment("paid") == "fulfill"
    assert decide_fulfillment("captured") == "fulfill"


def test_waits_on_non_terminal_statuses():
    assert decide_fulfillment("pending") == "wait"
    assert decide_fulfillment("three_ds_required") == "wait"
    assert decide_fulfillment("processing") == "wait"


def test_cancels_on_terminal_failures():
    assert decide_fulfillment("expired") == "cancel"
    assert decide_fulfillment("refused") == "cancel"
    assert decide_fulfillment("canceled") == "cancel"


def test_reconcile_returns_fulfillment_decision(config, make_transport):
    transport = make_transport(json_response(200, {"success": True, "requestId": "r", "data": {"id": "tx_1", "status": "paid"}}))
    client = PagouHttpClient(config, transport=transport)
    result = reconcile_transaction("tx_1", client)
    assert result["decision"] == "fulfill"
    assert result["transaction"]["status"] == "paid"


def test_reconcile_returns_none_when_missing(config, make_transport):
    transport = make_transport(json_response(404, {"message": "not found"}))
    client = PagouHttpClient(config, transport=transport)
    assert reconcile_transaction("missing", client) is None
