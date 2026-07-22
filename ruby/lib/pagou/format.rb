# frozen_string_literal: true

require "json"

module Pagou
  # Formats an integer amount in the smallest currency unit as a display string.
  def self.format_amount(cents, currency = "BRL")
    symbol = { "BRL" => "R$", "USD" => "$" }.fetch(currency, "#{currency} ")
    formatted = format("%.2f", cents.to_f / 100).reverse.gsub(/(\d{3})(?=\d)/, '\1.').reverse
    "#{symbol}#{formatted}"
  end

  # A short, unique idempotency key for a given operation and reference.
  def self.idempotency_key(operation, reference)
    "#{operation}_#{reference}"
  end

  # Prints a labelled JSON block for readable script output.
  def self.print_result(label, value)
    puts "\n#{label}:"
    puts JSON.pretty_generate(value)
  end
end
