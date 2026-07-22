# frozen_string_literal: true

require_relative "test_helper"
require_relative "../webhooks/handlers"
require_relative "../webhooks/processor"
require_relative "../webhooks/store"

class ParseWebhookTest < Minitest::Test
  include Pagou::Webhooks

  def test_routes_the_transaction_family_via_data_event_type
    event = Pagou::Webhooks.parse_webhook({ "id" => "evt_1", "event" => "transaction",
                                            "data" => { "id" => "tx_1", "event_type" => "transaction.paid" }, })
    assert_equal "evt_1", event.id
    assert_equal :transaction, event.family
    assert_equal "transaction.paid", event.event_type
    assert_equal "tx_1", event.resource_id
  end

  def test_routes_the_subscription_family
    event = Pagou::Webhooks.parse_webhook({ "id" => "evt_2", "event" => "subscription",
                                            "data" => { "id" => "sub_1", "event_type" => "subscription.renewed" }, })
    assert_equal :subscription, event.family
    assert_equal "subscription.renewed", event.event_type
    assert_equal "sub_1", event.resource_id
  end

  def test_routes_the_transfer_family_via_top_level_type_and_data_object
    event = Pagou::Webhooks.parse_webhook({ "id" => "evt_3", "type" => "payout.transferred",
                                            "data" => { "object" => { "id" => "tr_1" } }, })
    assert_equal :transfer, event.family
    assert_equal "payout.transferred", event.event_type
    assert_equal "tr_1", event.resource_id
  end

  def test_rejects_a_body_with_no_event_id
    assert_equal({ error: "missing_event_id" },
                 Pagou::Webhooks.parse_webhook({ "event" => "transaction", "data" => {} }),)
  end

  def test_parses_each_family_fixture_without_error
    %w[webhook.transaction.json webhook.subscription.json webhook.transfer.json].each do |name|
      result = Pagou::Webhooks.parse_webhook(load_fixture(name))
      assert_instance_of Pagou::Webhooks::WebhookEvent, result
    end
  end
end

class ConfirmedStateChangeTest < Minitest::Test
  def test_treats_terminal_money_events_as_confirmed
    assert Pagou::Webhooks.confirmed_state_change?("transaction.paid")
    assert Pagou::Webhooks.confirmed_state_change?("payout.transferred")
  end

  def test_treats_informational_events_as_non_confirming
    refute Pagou::Webhooks.confirmed_state_change?("transaction.created")
    refute Pagou::Webhooks.confirmed_state_change?("subscription.trial_will_end")
  end
end

class DedupeTest < Minitest::Test
  def setup
    Pagou::Webhooks::Store.reset
  end

  def test_returns_true_once_then_false_for_redeliveries
    assert_equal true, Pagou::Webhooks::Store.mark_processed("evt_x")
    assert_equal false, Pagou::Webhooks::Store.mark_processed("evt_x")
  end
end

class ProcessEventTest < Minitest::Test
  def setup
    Pagou::Webhooks::Store.reset
  end

  def event(family:, event_type:, resource_id:)
    Pagou::Webhooks::WebhookEvent.new(id: "evt", family: family, event_type: event_type,
                                      resource_id: resource_id, raw: {},)
  end

  def test_reconciles_and_updates_state_on_a_confirmed_event
    client = StubClient.new(FakeResponse.new(200,
                                             { "success" => true, "requestId" => "r",
                                               "data" => { "status" => "paid" }, }))
    Pagou::Webhooks.process_event(
      event(family: :transaction, event_type: "transaction.paid", resource_id: "tx_1"), client, SILENT_LOGGER,
    )
    assert_equal 1, client.requests.length
    assert_equal "paid", Pagou::Webhooks::Store.resource_state("tx_1")
  end

  def test_does_not_reconcile_or_change_state_on_a_non_confirming_event
    client = StubClient.new([])
    Pagou::Webhooks.process_event(
      event(family: :transaction, event_type: "transaction.created",
            resource_id: "tx_2",), client, SILENT_LOGGER,
    )
    assert_equal 0, client.requests.length
    assert_nil Pagou::Webhooks::Store.resource_state("tx_2")
  end

  def test_skips_reconciliation_when_the_confirmed_event_has_no_resource_id
    client = StubClient.new([])
    Pagou::Webhooks.process_event(
      event(family: :transaction, event_type: "transaction.paid", resource_id: ""), client, SILENT_LOGGER,
    )
    assert_equal 0, client.requests.length
  end

  def test_leaves_state_unchanged_when_the_resource_is_not_found
    client = StubClient.new(FakeResponse.new(404, { "message" => "not found" }))
    Pagou::Webhooks.process_event(
      event(family: :transfer, event_type: "payout.transferred", resource_id: "tr_x"), client, SILENT_LOGGER,
    )
    assert_nil Pagou::Webhooks::Store.resource_state("tr_x")
  end
end
