# frozen_string_literal: true

require_relative "../lib/pagou"

# Creates a voucher (boleto) charge. The printable instructions arrive
# asynchronously: the create response may return status: pending with the
# voucher block populated once the instrument is issued. Reconcile with a GET or
# a webhook to obtain the final barcode / digitable line / PDF URL.
# Run: ruby payments/create_voucher.rb
def main
  client = Pagou::Client.new

  input = {
    "amount" => 4900,
    "method" => "voucher",
    "currency" => "BRL",
    "buyer" => Pagou::DEMO_BUYER,
    "products" => Pagou::DEMO_PRODUCTS,
    "external_ref" => "voucher_#{Time.now.to_i}",
  }

  tx = client.request_data(method: "POST", path: "/v2/transactions", body: input).data

  puts "Created #{tx['id']} — #{tx['status']} — #{Pagou.format_amount(tx['amount'], tx['currency'])}"
  voucher = tx["voucher"] || {}
  if voucher["barcode"] || voucher["url"]
    Pagou.print_result("Voucher instructions", voucher)
  else
    puts "Instructions not ready yet — reconcile #{tx['id']} via GET or wait for the webhook."
  end
end

main if $PROGRAM_NAME == __FILE__
