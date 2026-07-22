# frozen_string_literal: true

module Pagou
  # Synthetic buyer data — safe to commit. Never use real documents or PII.
  DEMO_BUYER = {
    "name" => "Ana Souza",
    "email" => "ana.souza@example.com",
    "document" => { "type" => "CPF", "number" => "19100000000" },
  }.freeze

  DEMO_PRODUCTS = [{ "name" => "Pro Plan", "price" => 4900, "quantity" => 1 }].freeze

  # Reads a resource id from the first CLI argument or an env var.
  def self.resource_id_from_args(env_var)
    id = ARGV[0] || ENV.fetch(env_var, nil)
    raise "Pass a resource id as the first argument or set #{env_var}." if id.nil? || id.empty?

    id
  end
end
