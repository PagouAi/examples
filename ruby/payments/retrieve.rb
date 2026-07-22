# frozen_string_literal: true

require_relative "../lib/pagou"

# Retrieves a transaction by its public UUID.
# Run: ruby payments/retrieve.rb <transaction_id>
def main
  id = Pagou.resource_id_from_args("PAGOU_TRANSACTION_ID")
  client = Pagou::Client.new

  tx = client.request_data(method: "GET", path: "/v2/transactions/#{id}").data
  Pagou.print_result("Transaction", {
                       "id" => tx["id"],
                       "status" => tx["status"],
                       "amount" => tx["amount"],
                       "paid_amount" => tx["paid_amount"],
                       "refunded_amount" => tx["refunded_amount"],
                       "paid_at" => tx["paid_at"],
                     })
rescue Pagou::NotFoundError
  warn "No transaction #{id}."
end

main if $PROGRAM_NAME == __FILE__
