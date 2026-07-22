# frozen_string_literal: true

require "set"

module Pagou
  # Statuses at which a charge is settled and it is safe to fulfill.
  TERMINAL_PAID_STATUSES = %w[paid captured].to_set.freeze

  # Terminal failure/cancel states: stop waiting, release the order.
  TERMINAL_FAILED_STATUSES = %w[canceled expired refused].to_set.freeze

  # Statuses from which a transfer can typically be cancelled.
  CANCELABLE_TRANSFER_STATUSES = %w[pending scheduled].to_set.freeze
end
