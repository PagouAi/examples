# frozen_string_literal: true

require_relative "../lib/pagou"

# Creates a hosted checkout link. The v2 contract exposes only POST — the
# returned public identifier is the checkout URL itself (data.url); persist it to
# share with the buyer. There is no retrieve/list endpoint.
# Run: ruby checkout-links/create.rb
def main
  client = Pagou::Client.new

  input = {
    "title" => "Pro Plan",
    "currency" => "BRL",
    "products" => [
      { "external_id" => "pro-plan", "name" => "Pro Plan", "price" => 4900, "quantity" => 1,
        "type" => "digital", },
    ],
  }

  data = client.request_data(method: "POST", path: "/v2/checkout-links", body: input).data

  # Persist the URL — it is the only handle to the link.
  Pagou.print_result("Checkout link (store this URL)", data["url"])
end

main if $PROGRAM_NAME == __FILE__
