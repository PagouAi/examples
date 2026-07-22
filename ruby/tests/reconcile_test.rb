# frozen_string_literal: true

require_relative "test_helper"

class DecideFulfillmentTest < Minitest::Test
  def test_fulfills_only_on_settled_statuses
    assert_equal :fulfill, Pagou.decide_fulfillment("paid")
    assert_equal :fulfill, Pagou.decide_fulfillment("captured")
  end

  def test_waits_on_non_terminal_statuses
    assert_equal :wait, Pagou.decide_fulfillment("pending")
    assert_equal :wait, Pagou.decide_fulfillment("three_ds_required")
    assert_equal :wait, Pagou.decide_fulfillment("processing")
  end

  def test_cancels_on_terminal_failures
    assert_equal :cancel, Pagou.decide_fulfillment("expired")
    assert_equal :cancel, Pagou.decide_fulfillment("refused")
    assert_equal :cancel, Pagou.decide_fulfillment("canceled")
  end
end

class ReconcileTransactionTest < Minitest::Test
  def test_fetches_the_transaction_and_returns_a_decision
    client = StubClient.new(FakeResponse.new(200,
                                             { "success" => true, "requestId" => "r",
                                               "data" => { "id" => "tx_1", "status" => "paid" }, }))
    result = Pagou.reconcile_transaction("tx_1", client)
    assert_equal :fulfill, result[:decision]
    assert_equal "paid", result[:transaction]["status"]
  end

  def test_returns_nil_when_the_transaction_does_not_exist
    client = StubClient.new(FakeResponse.new(404, { "message" => "not found" }))
    assert_nil Pagou.reconcile_transaction("missing", client)
  end
end
