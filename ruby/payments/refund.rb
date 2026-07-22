# frozen_string_literal: true

require_relative "../lib/pagou"

# Refunds a transaction. Omit the amount for a full refund; pass cents for a
# partial one. The refund is idempotent via an Idempotency-Key so a retry after
# a network blip never double-refunds.
# Run: ruby payments/refund.rb <transaction_id> [amount_cents]
def main
  id = Pagou.resource_id_from_args("PAGOU_TRANSACTION_ID")
  amount = ARGV[1] ? Integer(ARGV[1]) : nil
  client = Pagou::Client.new

  body = { "reason" => "requested_by_customer" }
  body["amount"] = amount if amount

  refund = client.request_data(
    method: "PUT",
    path: "/v2/transactions/#{id}/refund",
    body: body,
    idempotency_key: Pagou.idempotency_key("refund", "#{id}_#{amount || 'full'}"),
  ).data

  puts refund["is_full_refund"] ? "Full refund processed." : "Partial refund processed."
  Pagou.print_result("Refund", {
                       "amount_refunded" => Pagou.format_amount(refund["amount_refunded"]),
                       "remaining_balance" => Pagou.format_amount(refund["remaining_balance"]),
                     })
rescue Pagou::InvalidRequestError => e
  warn "Refund rejected: #{e.message}"
end

main if $PROGRAM_NAME == __FILE__
