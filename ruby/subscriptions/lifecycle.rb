# frozen_string_literal: true

require_relative "../lib/pagou"
require_relative "customers"

# End-to-end subscription lifecycle with the raw client:
#   create/reuse customer → create subscription → retrieve → cancel.
# Renewal / failure / past-due / cancellation are delivered as webhooks
# (see ../webhooks); business state changes only on those confirmed events.
# Run: PAGOU_CARD_TOKEN=pgct_... ruby subscriptions/lifecycle.rb
def main
  token = ENV.fetch("PAGOU_CARD_TOKEN", nil)
  raise "Set PAGOU_CARD_TOKEN to a pgct_ token from the Payment Element (subscription mode)." unless token

  client = Pagou::Client.new

  customer = Pagou.create_or_reuse_customer(client)
  puts "Customer #{customer['id']} (#{customer['email']})"

  input = {
    "customer_id" => customer["id"],
    "payment_method" => "credit_card",
    "token" => token,
    "interval" => "month",
    "interval_count" => 1,
    "amount" => 4900,
    "currency" => "BRL",
    "failure_policy" => "retry_then_cancel",
    "retry_offsets_days" => [1, 3, 7],
    "products" => [{ "name" => "Pro Plan", "price" => 4900 }],
  }

  sub = client.request_data(
    method: "POST",
    path: "/v2/subscriptions",
    body: input,
    # Idempotent create: a retry reuses the same subscription instead of a duplicate.
    idempotency_key: Pagou.idempotency_key("sub_create", customer["id"]),
  ).data
  puts "Subscription #{sub['id']} — #{sub['status']} — #{Pagou.format_amount(sub['amount'],
                                                                             sub['currency'],)}/month"

  fetched = client.request_data(method: "GET", path: "/v2/subscriptions/#{sub['id']}").data
  Pagou.print_result("Billed transactions", fetched["transactions"] || [])

  canceled = client.request_data(
    method: "POST",
    path: "/v2/subscriptions/#{sub['id']}/cancel",
    body: { "reason" => "user_requested" },
  ).data
  puts "Canceled #{canceled['id']}: cancelAtPeriodEnd=#{canceled['cancelAtPeriodEnd']}, " \
       "canceledAt=#{canceled['canceledAt']}"
end

main if $PROGRAM_NAME == __FILE__
