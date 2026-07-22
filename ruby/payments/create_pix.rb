# frozen_string_literal: true

require_relative "../lib/pagou"

# Creates a Pix charge and returns the copy-and-paste QR payload (pix.qr_code).
# Run: ruby payments/create_pix.rb
def main
  client = Pagou::Client.new

  input = {
    "amount" => 4900,
    "method" => "pix",
    "currency" => "BRL",
    "buyer" => Pagou::DEMO_BUYER,
    "products" => Pagou::DEMO_PRODUCTS,
    # external_ref doubles as a natural idempotency key: a duplicate value is
    # rejected with 409 DUPLICATE_EXTERNAL_REF instead of double-charging.
    "external_ref" => "order_#{Time.now.to_i}",
  }

  tx = client.request_data(method: "POST", path: "/v2/transactions", body: input).data

  puts "Created #{tx['id']} — #{tx['status']} — #{Pagou.format_amount(tx['amount'], tx['currency'])}"
  Pagou.print_result("Pix QR (copy and paste)", tx.dig("pix", "qr_code"))
  Pagou.print_result("Expires at", tx.dig("pix", "expiration_date"))
rescue Pagou::ConflictError
  warn "Duplicate external_ref — this charge was already created."
end

main if $PROGRAM_NAME == __FILE__
