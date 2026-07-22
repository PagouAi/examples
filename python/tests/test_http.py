import httpx
import pytest
from conftest import json_response

from pagou.config import PagouConfig
from pagou.errors import NetworkError, NotFoundError, ServerError
from pagou.http import PagouHttpClient


def test_unwraps_data_envelope(config, make_transport):
    transport = make_transport(json_response(200, {"success": True, "requestId": "req_1", "data": {"id": "tx_1"}}))
    client = PagouHttpClient(config, transport=transport)

    result = client.request_data("GET", "/v2/transactions/tx_1")
    assert result.data["id"] == "tx_1"
    assert result.request_id == "req_1"


def test_sends_authorization_and_correlation_id(config, make_transport):
    transport = make_transport(json_response(200, {"success": True, "requestId": "r", "data": {}}))
    client = PagouHttpClient(config, transport=transport)
    client.request_data("GET", "/v2/transactions")

    request = transport.requests[0]
    assert request.headers["Authorization"] == "Bearer test_token"
    assert len(request.headers["X-Request-Id"]) == 36


def test_maps_404_without_retry(config, make_transport):
    transport = make_transport(json_response(404, {"message": "not found", "code": "NOT_FOUND"}))
    client = PagouHttpClient(config, transport=transport)

    with pytest.raises(NotFoundError):
        client.request_data("GET", "/v2/transactions/x")
    assert transport.call_count == 1


def test_retries_500_on_get_then_succeeds(config, make_transport):
    transport = make_transport(
        json_response(500, {"message": "boom"}),
        json_response(200, {"success": True, "requestId": "r", "data": {"ok": True}}),
    )
    client = PagouHttpClient(config, transport=transport)

    result = client.request_data("GET", "/v2/transactions")
    assert result.data["ok"] is True
    assert transport.call_count == 2


def test_does_not_retry_post_without_idempotency_key(config, make_transport):
    transport = make_transport(json_response(500, {"message": "boom"}))
    client = PagouHttpClient(config, transport=transport)

    with pytest.raises(ServerError):
        client.request_data("POST", "/v2/transactions", body={})
    assert transport.call_count == 1


def test_retries_post_when_idempotency_key_present(config, make_transport):
    transport = make_transport(
        json_response(503, {"message": "unavailable"}),
        json_response(200, {"success": True, "requestId": "r", "data": {"id": "tx"}}),
    )
    client = PagouHttpClient(config, transport=transport)

    result = client.request_data("POST", "/v2/transactions", body={}, idempotency_key="idem_1")
    assert result.data["id"] == "tx"
    assert transport.requests[0].headers["Idempotency-Key"] == "idem_1"


def test_raises_network_error_on_timeout(make_transport):
    transport = make_transport(httpx.ReadTimeout("timed out"))
    no_retry = PagouConfig(
        environment="sandbox",
        base_url="https://api.sandbox.pagou.ai",
        api_token="test_token",
        timeout_ms=30,
        max_retries=0,
    )
    client = PagouHttpClient(no_retry, transport=transport)

    with pytest.raises(NetworkError) as excinfo:
        client.request_data("GET", "/v2/transactions")
    assert excinfo.value.message == "Request timed out"


def test_serializes_array_query_params_comma_joined(config, make_transport):
    transport = make_transport(
        json_response(200, {"success": True, "requestId": "r", "data": [], "next_cursor": None, "prev_cursor": None, "total": 0})
    )
    client = PagouHttpClient(config, transport=transport)
    client.request_cursor_page("GET", "/v2/transactions", query={"paymentMethods": ["pix", "credit_card"]})

    assert transport.requests[0].url.params["paymentMethods"] == "pix,credit_card"
