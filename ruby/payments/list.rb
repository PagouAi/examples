# frozen_string_literal: true

require_relative "../lib/pagou"

# Lists transactions with cursor pagination. Filters use camelCase query names
# (paymentMethods), while the envelope cursors are snake_case
# (next_cursor / prev_cursor). Walks up to three pages forward.
# Run: ruby payments/list.rb
def main
  client = Pagou::Client.new
  cursor = nil

  (1..3).each do |page_num|
    query = { "limit" => 5, "paymentMethods" => %w[pix credit_card] }
    if cursor
      query["cursor"] = cursor
      query["direction"] = "next"
    end

    page = client.request_cursor_page(method: "GET", path: "/v2/transactions", query: query).data

    puts "\nPage #{page_num} — #{page['data'].length} of #{page['total']} total"
    page["data"].each do |item|
      payment = item["payment"]
      puts "  #{item['id']}  #{item['status'].ljust(18)}  #{payment['method']}  #{payment['amount']}"
    end

    if page["next_cursor"].nil?
      puts "\nNo more pages."
      break
    end
    cursor = page["next_cursor"]
  end
end

main if $PROGRAM_NAME == __FILE__
