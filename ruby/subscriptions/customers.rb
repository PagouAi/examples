# frozen_string_literal: true

require_relative "../lib/pagou"

module Pagou
  # Reuses PAGOU_CUSTOMER_ID when set, otherwise creates a fresh customer.
  def self.create_or_reuse_customer(client)
    existing = ENV.fetch("PAGOU_CUSTOMER_ID", nil)
    return client.request_data(method: "GET", path: "/v2/customers/#{existing}").data if existing

    input = {
      "name" => "Ana Souza",
      "email" => "ana.souza+#{Time.now.to_i}@example.com",
      "document" => { "type" => "CPF", "number" => "19100000000" },
      "phone" => "11999990000",
      "externalRef" => "cust_#{Time.now.to_i}",
    }

    client.request_data(method: "POST", path: "/v2/customers", body: input).data
  end
end
