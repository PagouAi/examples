# frozen_string_literal: true

require "set"
require_relative "../lib/pagou"

module Pagou
  module Webhooks
    # A parsed webhook event. family is :transaction, :subscription or :transfer.
    WebhookEvent = Struct.new(:id, :family, :event_type, :resource_id, :raw, keyword_init: true)

    # Event types that assert a confirmed, fulfillable state change.
    CONFIRMED_EVENTS = %w[
      transaction.paid transaction.refunded transaction.partially_refunded transaction.chargedback
      subscription.renewed subscription.payment_failed subscription.past_due subscription.canceled
      payout.transferred payout.failed payout.rejected payout.canceled
    ].to_set.freeze

    # Routes a raw webhook body to one of the three families and extracts the
    # dedupe id, event type and resource id. Returns a WebhookEvent, or a
    # { error: ... } hash so the server can answer with the documented body.
    # The public contract exposes no signature header, so authenticity is
    # established downstream by reconciling against the API — never by trusting
    # these bodies. Every family carries a top-level `id` that is THE dedupe key
    # (a resource emits many events over time, so deduping by resource id would
    # drop distinct events).
    def self.parse_webhook(body)
      return { error: "unknown_envelope" } unless body.is_a?(Hash)

      id = body["id"]
      return { error: "missing_event_id" } unless id.is_a?(String) && !id.empty?

      # Transactions: envelope event = "transaction", name in data.event_type.
      if body["event"] == "transaction"
        data = body["data"] || {}
        return WebhookEvent.new(
          id: id, family: :transaction,
          event_type: (data["event_type"] || "transaction.unknown").to_s,
          resource_id: data["id"].to_s, raw: body,
        )
      end

      # Subscriptions: envelope event = "subscription", name in data.event_type.
      if body["event"] == "subscription"
        data = body["data"] || {}
        return WebhookEvent.new(
          id: id, family: :subscription,
          event_type: (data["event_type"] || "subscription.unknown").to_s,
          resource_id: data["id"].to_s, raw: body,
        )
      end

      # Transfers: top-level type, resource in data.object.
      if body["type"].is_a?(String)
        object = (body["data"] || {})["object"] || {}
        return WebhookEvent.new(
          id: id, family: :transfer,
          event_type: body["type"], resource_id: object["id"].to_s, raw: body,
        )
      end

      { error: "unknown_envelope" }
    end

    # Whether an event should trigger reconciliation + a business-state change.
    def self.confirmed_state_change?(event_type)
      CONFIRMED_EVENTS.include?(event_type)
    end
  end
end
