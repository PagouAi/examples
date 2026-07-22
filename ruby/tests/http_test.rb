# frozen_string_literal: true

require_relative "test_helper"

class HttpClientTest < Minitest::Test
  def test_unwraps_the_envelope
    client = StubClient.new(FakeResponse.new(200,
                                             { "success" => true, "requestId" => "req_1",
                                               "data" => { "id" => "tx_1" }, }))
    result = client.request_data(method: "GET", path: "/v2/transactions/tx_1")
    assert_equal "tx_1", result.data["id"]
    assert_equal "req_1", result.request_id
  end

  def test_sends_authorization_and_generated_correlation_id
    client = StubClient.new(FakeResponse.new(200, { "success" => true, "requestId" => "r", "data" => {} }))
    client.request_data(method: "GET", path: "/v2/transactions")
    req = client.requests.first[:request]
    assert_equal "Bearer test_token", req["Authorization"]
    assert_match(/[0-9a-f-]{36}/, req["X-Request-Id"])
  end

  def test_maps_404_to_not_found_without_retrying
    client = StubClient.new(FakeResponse.new(404, { "message" => "not found", "code" => "NOT_FOUND" }))
    assert_raises(Pagou::NotFoundError) do
      client.request_data(method: "GET", path: "/v2/transactions/x")
    end
    assert_equal 1, client.requests.length
  end

  def test_retries_a_500_on_get_then_succeeds
    client = StubClient.new([
                              FakeResponse.new(500, { "message" => "boom" }),
                              FakeResponse.new(200,
                                               { "success" => true, "requestId" => "r",
                                                 "data" => { "ok" => true }, }),
                            ])
    result = client.request_data(method: "GET", path: "/v2/transactions")
    assert_equal true, result.data["ok"]
    assert_equal 2, client.requests.length
  end

  def test_does_not_retry_a_post_without_idempotency_key
    client = StubClient.new(FakeResponse.new(500, { "message" => "boom" }))
    assert_raises(Pagou::ServerError) do
      client.request_data(method: "POST", path: "/v2/transactions", body: {})
    end
    assert_equal 1, client.requests.length
  end

  def test_retries_a_post_when_an_idempotency_key_is_present
    client = StubClient.new([
                              FakeResponse.new(503, { "message" => "unavailable" }),
                              FakeResponse.new(200,
                                               { "success" => true, "requestId" => "r",
                                                 "data" => { "id" => "tx" }, }),
                            ])
    result = client.request_data(method: "POST", path: "/v2/transactions", body: {},
                                 idempotency_key: "idem_1",)
    assert_equal "tx", result.data["id"]
    assert_equal "idem_1", client.requests.first[:request]["Idempotency-Key"]
  end

  def test_raises_network_error_with_timeout_message_when_the_request_aborts
    client = StubClient.new([Net::ReadTimeout.new], config: TEST_CONFIG.dup.tap { |c| c.max_retries = 0 })
    error = assert_raises(Pagou::NetworkError) do
      client.request_data(method: "GET", path: "/v2/transactions")
    end
    assert_equal "Request timed out", error.message
  end

  def test_serializes_array_query_params_as_comma_joined_values
    client = StubClient.new(FakeResponse.new(200,
                                             { "success" => true, "requestId" => "r", "data" => [], "next_cursor" => nil, "prev_cursor" => nil,
                                               "total" => 0, }))
    client.request_cursor_page(method: "GET", path: "/v2/transactions",
                               query: { "paymentMethods" => %w[pix credit_card] },)
    uri = client.requests.first[:uri]
    params = URI.decode_www_form(uri.query).to_h
    assert_equal "pix,credit_card", params["paymentMethods"]
  end
end
