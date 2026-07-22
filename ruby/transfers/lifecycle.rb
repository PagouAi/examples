# frozen_string_literal: true

require_relative "../lib/pagou"

# Pix Out lifecycle with the raw client: create → retrieve/reconcile → cancel.
# The final state (paid / rejected) arrives via the transfer webhook family;
# reconcile with GET when you need certainty. Note amount is a numeric cents
# value on input but a decimal string on responses.
# Run: ruby transfers/lifecycle.rb
def main
  client = Pagou::Client.new

  external_ref = "payout_#{Time.now.to_i}"
  input = {
    "pix_key_type" => "EMAIL",
    "pix_key_value" => "supplier@example.com",
    "amount" => 5000, # R$50.00 in cents (minimum is 1000)
    "description" => "Supplier payout",
    "external_ref" => external_ref,
  }

  created = client.request_data(
    method: "POST",
    path: "/v2/transfers",
    body: input,
    idempotency_key: Pagou.idempotency_key("transfer", external_ref),
  ).data
  puts "Transfer #{created['id']} — #{created['status']} — amount(cents)=#{created['amount']}"

  # Reconcile: re-read the current state before acting on it.
  current = client.request_data(method: "GET", path: "/v2/transfers/#{created['id']}").data
  Pagou.print_result("Current state", {
                       "id" => current["id"], "status" => current["status"], "fee" => current["fee"],
                     })

  unless Pagou::CANCELABLE_TRANSFER_STATUSES.include?(current["status"])
    puts "Status #{current['status']} is not cancelable; the final state will arrive by webhook."
    return
  end

  begin
    canceled = client.request_data(
      method: "POST",
      path: "/v2/transfers/#{created['id']}/cancel",
      body: { "reason" => "wrong recipient" },
    ).data
    puts "Canceled #{canceled['id']} — #{canceled['status']}"
  rescue Pagou::ConflictError
    warn "Already progressed past a cancelable state — reconcile via webhook/GET."
  end
end

main if $PROGRAM_NAME == __FILE__
