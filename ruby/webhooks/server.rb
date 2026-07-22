# frozen_string_literal: true

require "webrick"
require "json"
require_relative "../lib/pagou"
require_relative "handlers"
require_relative "store"
require_relative "processor"

# Webhook receiver for the three event families. It follows the rules every
# handler must: parse the envelope, require the event id, dedupe redeliveries,
# answer 2xx immediately, and offload the slow reconciliation. Business state is
# updated only inside the offloaded processor, only on confirmed events.
# Run: ruby webhooks/server.rb  (POST envelopes to http://localhost:4000/webhooks/pagou)
module Pagou
  module Webhooks
    PORT = Integer(ENV.fetch("PORT", "4000"))

    def self.run_server
      logger = Pagou.logger
      server = WEBrick::HTTPServer.new(Port: PORT, Logger: WEBrick::Log.new(File::NULL), AccessLog: [])

      server.mount_proc("/webhooks/pagou") do |req, res|
        handle(req, res, logger)
      end

      trap("INT") { server.shutdown }
      logger.info("Webhook receiver on http://localhost:#{PORT}/webhooks/pagou")
      server.start
    end

    def self.handle(req, res, logger)
      unless req.request_method == "POST"
        reply(res, 404, { "error" => "not_found" })
        return
      end

      begin
        parsed_body = JSON.parse(req.body || "")
      rescue JSON::ParserError
        reply(res, 400, { "error" => "invalid_json" })
        return
      end

      event = parse_webhook(parsed_body)
      if event.is_a?(Hash) && event[:error]
        # Documented ingestion error for a missing event id.
        reply(res, event[:error] == "missing_event_id" ? 400 : 422, { "error" => event[:error] })
        return
      end

      # Dedupe synchronously: a redelivery is acknowledged without reprocessing.
      unless Store.mark_processed(event.id)
        logger.info("Duplicate delivery ignored: #{event.id} (#{event.event_type})")
        reply(res, 200, { "received" => true })
        return
      end

      # Ack fast (fulfilling the "respond 2xx quickly" rule), then offload the
      # reconciliation so a slow API call never delays the response or risks a retry.
      reply(res, 200, { "received" => true })
      Thread.new do
        process_event(event)
      rescue StandardError => e
        logger.error("Deferred processing failed for #{event.id}", { message: e.message })
      end
    end

    def self.reply(res, status, body)
      res.status = status
      res["Content-Type"] = "application/json"
      res.body = JSON.generate(body)
    end
  end
end

Pagou::Webhooks.run_server if $PROGRAM_NAME == __FILE__
