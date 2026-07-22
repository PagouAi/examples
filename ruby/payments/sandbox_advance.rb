# frozen_string_literal: true

require_relative "../lib/pagou"

# Sandbox-only helper: forces a transaction to a target status so you can
# exercise the paid/refunded paths without a real payer. Never available in
# production. Run: ruby payments/create_pix.rb, then:
# ruby payments/sandbox_advance.rb <transaction_id> [status=paid]
def main
  id = Pagou.resource_id_from_args("PAGOU_TRANSACTION_ID")
  status = ARGV[1] || "paid"
  client = Pagou::Client.new

  data = client.request_data(
    method: "PUT",
    path: "/v2/transactions/#{id}",
    body: { "status" => status },
  ).data

  Pagou.print_result("Sandbox transaction updated", data["transaction"] || data)
end

main if $PROGRAM_NAME == __FILE__
