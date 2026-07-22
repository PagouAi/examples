# frozen_string_literal: true

require_relative "../lib/pagou"
require_relative "handlers"
require_relative "store"

module Pagou
  module Webhooks
    RESOURCE_PATH = {
      transaction: "/v2/transactions",
      subscription: "/v2/subscriptions",
      transfer: "/v2/transfers",
    }.freeze

    # The offloaded, slow half of webhook handling. It runs AFTER the fast 2xx
    # ack. Business state changes only on a confirmed event, and only after
    # reconciling against the API — the webhook body is a hint, the API is the
    # source of truth.
    def self.process_event(event, client = Client.new, logger = Pagou.logger)
      unless confirmed_state_change?(event.event_type)
        logger.info("Ignoring non-confirming event #{event.event_type} (#{event.id})")
        return
      end
      if event.resource_id.nil? || event.resource_id.empty?
        logger.warn("Confirmed event #{event.event_type} without a resource id — cannot reconcile.")
        return
      end

      begin
        data = client.request_data(
          method: "GET",
          path: "#{RESOURCE_PATH.fetch(event.family)}/#{event.resource_id}",
        ).data
        Store.set_resource_state(event.resource_id, data["status"])
        logger.info("Reconciled #{event.family} #{event.resource_id} → #{data['status']}")
      rescue NotFoundError
        logger.warn("Resource #{event.resource_id} not found during reconciliation.")
        nil
      rescue StandardError => e
        # Reconciliation failed after the ack: a real system would requeue this
        # event for a later retry rather than replaying side effects.
        logger.error("Reconciliation failed for #{event.id}", { message: e.message })
        raise
      end
    end
  end
end
