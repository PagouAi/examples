# frozen_string_literal: true

require "webrick"
require "json"
require_relative "../../lib/pagou"

# Minimal server for the browser card flow. It serves the Payment Element page
# (injecting only the publishable key) and exposes POST /api/pay, which turns the
# browser's pgct_ token into a real charge via POST /v2/transactions.
# Run: ruby payments/card_element/server.rb  then open http://localhost:3000
module CardElement
  HERE = __dir__
  PORT = Integer(ENV.fetch("PORT", "3000"))

  def self.run
    config = Pagou.load_config
    client = Pagou::Client.new(config: config)
    logger = Pagou.logger
    server = WEBrick::HTTPServer.new(Port: PORT, Logger: WEBrick::Log.new(File::NULL), AccessLog: [])

    server.mount_proc("/") { |req, res| serve_page(req, res, config) }
    server.mount_proc("/api/pay") { |req, res| pay(req, res, client, logger) }

    trap("INT") { server.shutdown }
    logger.info("Card demo on http://localhost:#{PORT}")
    server.start
  end

  def self.serve_page(req, res, config)
    if req.request_method == "GET" && ["/", "/index.html"].include?(req.path)
      html = File.read(File.join(HERE, "index.html"))
      publishable_key = config.publishable_key || "pk_test_set_PAGOU_PUBLISHABLE_KEY"
      res.status = 200
      res["Content-Type"] = "text/html"
      res.body = html.sub("__PUBLISHABLE_KEY__", publishable_key)
    else
      res.status = 404
      res.body = "Not found"
    end
  end

  def self.pay(req, res, client, logger)
    unless req.request_method == "POST"
      res.status = 404
      res.body = "Not found"
      return
    end

    token = JSON.parse(req.body || "{}")["token"] rescue nil
    unless token.is_a?(String) && token.match?(/\Apg(ct|pm)_/)
      res.status = 400
      res["Content-Type"] = "application/json"
      res.body = JSON.generate({ "error" => "A pgct_/pgpm_ token is required." })
      return
    end

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

    # Return id/status/next_action so the browser SDK can continue 3DS.
    # Do NOT fulfill here — wait for the confirmed webhook.
    res.status = 200
    res["Content-Type"] = "application/json"
    res.body = JSON.generate({
                               "data" => { "id" => tx["id"], "status" => tx["status"],
                                           "next_action" => tx["next_action"], },
                             })
  rescue StandardError => e
    logger.error("Request failed", { message: e.message })
    res.status = 500
    res["Content-Type"] = "application/json"
    res.body = JSON.generate({ "error" => "Unexpected error" })
  end
end

CardElement.run if $PROGRAM_NAME == __FILE__
