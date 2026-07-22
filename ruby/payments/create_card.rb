# frozen_string_literal: true

require_relative "../lib/pagou"

# Backend half of the card flow. The pgct_ token is produced in the browser by
# the Payment Element (see ./card_element) and posted to your server; it is the
# ONLY card credential your backend ever sees — never a PAN or CVV.
# Run: PAGOU_CARD_TOKEN=pgct_... ruby payments/create_card.rb  (or pass as arg 1)
def main
  token = ARGV[0] || ENV.fetch("PAGOU_CARD_TOKEN", nil)
  unless token
    raise "Provide a pgct_ token from the Payment Element (arg 1 or PAGOU_CARD_TOKEN). " \
          "Start the browser demo with: ruby payments/card_element/server.rb"
  end

  client = Pagou::Client.new
  input = {
    "amount" => 4900,
    "method" => "credit_card",
    "currency" => "BRL",
    "token" => token,
    "installments" => 1,
    "buyer" => Pagou::DEMO_BUYER,
    "products" => Pagou::DEMO_PRODUCTS,
    "external_ref" => "card_#{Time.now.to_i}",
  }

  tx = client.request_data(method: "POST", path: "/v2/transactions", body: input).data
  puts "Created #{tx['id']} — #{tx['status']} — #{Pagou.format_amount(tx['amount'], tx['currency'])}"

  if tx["status"] == "three_ds_required" && tx["next_action"]
    # 3DS: return next_action to the browser so the Payment Element can open the
    # challenge. Do NOT fulfill here — wait for the confirmed webhook.
    Pagou.print_result("next_action (return to the browser to continue 3DS)", tx["next_action"])
    return
  end

  puts "No 3DS challenge required. Confirm the final state via webhook or reconciliation."
end

main if $PROGRAM_NAME == __FILE__
