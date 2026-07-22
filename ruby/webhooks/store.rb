# frozen_string_literal: true

require "set"

module Pagou
  module Webhooks
    # In-memory persistence stand-ins. A real integration would back these with a
    # database: the processed-events table gives idempotency across redeliveries,
    # and the business-state table is the record you actually fulfill against.
    module Store
      @processed_events = Set.new
      @business_state = {}
      @mutex = Mutex.new

      class << self
        # True the first time an event id is seen; false for any redelivery.
        def mark_processed(event_id)
          @mutex.synchronize do
            next false if @processed_events.include?(event_id)

            @processed_events.add(event_id)
            true
          end
        end

        def processed?(event_id)
          @processed_events.include?(event_id)
        end

        # Records the reconciled state of a resource (the fulfillable truth).
        def set_resource_state(resource_id, state)
          @mutex.synchronize { @business_state[resource_id] = state }
        end

        def resource_state(resource_id)
          @business_state[resource_id]
        end

        # Test/support helper to reset the in-memory stores.
        def reset
          @mutex.synchronize do
            @processed_events.clear
            @business_state.clear
          end
        end
      end
    end
  end
end
