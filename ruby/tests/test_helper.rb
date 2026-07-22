# frozen_string_literal: true

if ENV["COVERAGE"]
  require "simplecov"
  SimpleCov.start do
    add_filter "/tests/"
    add_group "Library", "lib"
    add_group "Webhooks", "webhooks"
  end
end

require "minitest/autorun"
require "json"
require_relative "../lib/pagou"

# A fake HTTP response that quacks like Net::HTTPResponse for the client's needs.
class FakeResponse
  def initialize(status, body, headers = {})
    @status = status
    @body = body.is_a?(String) ? body : JSON.generate(body)
    @headers = { "content-type" => "application/json" }.merge(headers)
  end

  def code
    @status.to_s
  end

  attr_reader :body

  def [](key)
    @headers[key.downcase]
  end
end

# A client whose transport is a stubbed queue of responses, so the shared logic
# is exercised entirely offline (mirroring the injected fetch in the TS suite).
class StubClient < Pagou::Client
  attr_reader :requests

  def initialize(responses, config: TEST_CONFIG)
    super(config: config, logger: SILENT_LOGGER)
    @responses = Array(responses)
    @requests = []
  end

  private

  def perform(uri, method, body, idempotency_key, request_id, _timeout_ms)
    # Build the real request so header/auth assertions see what would go on the wire.
    req = build_request(uri, method, body, idempotency_key, request_id)
    @requests << { uri: uri, method: method, request: req, body: body }
    raise "no stubbed response left" if @responses.empty?

    resp = @responses.shift
    resp.is_a?(Exception) ? raise(resp) : resp
  end
end

# A logger that discards output to keep test runs quiet.
SILENT_LOGGER = Object.new.tap do |logger|
  def logger.info(*); end
  def logger.warn(*); end
  def logger.error(*); end
end

TEST_CONFIG = Pagou::Config.new(
  environment: "sandbox",
  base_url: "https://api.sandbox.pagou.ai",
  api_token: "test_token",
  timeout_ms: 1000,
  max_retries: 1,
).freeze

def load_fixture(name)
  JSON.parse(File.read(File.join(__dir__, "fixtures", name)))
end
