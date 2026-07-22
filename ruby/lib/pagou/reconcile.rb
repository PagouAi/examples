# frozen_string_literal: true

module Pagou
  # Maps a transaction status to a business decision. Never fulfill on a pending
  # state. Returns :fulfill, :wait or :cancel.
  def self.decide_fulfillment(status)
    return :fulfill if TERMINAL_PAID_STATUSES.include?(status)
    return :cancel if TERMINAL_FAILED_STATUSES.include?(status)

    :wait
  end

  # Server-side reconciliation: fetch the transaction from the API (the source of
  # truth) and decide whether to fulfill. Business state changes only on this
  # confirmed result, never on an unverified webhook body. Returns a hash
  # { transaction:, decision: } or nil when the transaction does not exist.
  def self.reconcile_transaction(id, client = Client.new)
    result = client.request_data(method: "GET", path: "/v2/transactions/#{id}")
    transaction = result.data
    { transaction: transaction, decision: decide_fulfillment(transaction["status"]) }
  rescue NotFoundError
    nil
  end
end
