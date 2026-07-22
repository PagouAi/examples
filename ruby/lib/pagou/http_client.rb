# frozen_string_literal: true

require "net/http"
require "uri"
require "json"
require "securerandom"
require "openssl"

module Pagou
  # A single HTTP response, envelope kept intact.
  Result = Struct.new(:data, :status, :request_id)

  # Minimal, dependency-free reference client for the Pagou API v2 built on the
  # standard-library net/http. It demonstrates the fundamentals every language
  # example must show: server-side auth, correlation ids, idempotency keys,
  # timeouts, bounded retries for transient failures on idempotent operations,
  # typed errors and redacted logging.
  class Client
    RETRYABLE_STATUS = [429, 500, 502, 503, 504].freeze
    IDEMPOTENT_METHODS = %w[GET HEAD].freeze
    TRANSPORT_ERRORS = [
      SocketError, SystemCallError, OpenSSL::SSL::SSLError, IOError,
      Net::HTTPBadResponse, Net::ProtocolError, EOFError,
    ].freeze

    def initialize(config: Pagou.load_config, logger: Pagou.logger)
      @config = config
      @logger = logger
    end

    # Performs a request and returns the raw parsed body inside a Result.
    def request(method:, path:, query: nil, body: nil, idempotency_key: nil, request_id: nil, timeout_ms: nil)
      method = method.to_s.upcase
      request_id ||= SecureRandom.uuid
      uri = build_uri(path, query)
      retryable = can_retry?(method, idempotency_key)
      max_attempts = retryable ? @config.max_retries + 1 : 1

      @logger.info("→ #{method} #{uri.request_uri}", { request_id: request_id, body: body })

      attempt = 0
      last_error = nil
      while attempt < max_attempts
        begin
          response = perform(uri, method, body, idempotency_key, request_id, timeout_ms)
          response_id = response["x-request-id"] || request_id
          status = response.code.to_i
          payload = parse_body(response)

          if status >= 400
            if retryable && RETRYABLE_STATUS.include?(status) && attempt < max_attempts - 1
              sleep(backoff_seconds(attempt, response["retry-after"]))
              attempt += 1
              next
            end
            error = Pagou.to_api_error(status, payload, response_id)
            @logger.warn("← #{status} #{method} #{uri.path}", { request_id: response_id, code: error.code })
            raise error
          end

          @logger.info("← #{status} #{method} #{uri.path}", { request_id: response_id })
          return Result.new(payload, status, response_id)
        rescue ApiError
          raise
        rescue Net::OpenTimeout, Net::ReadTimeout => e
          last_error = e
          if retryable && attempt < max_attempts - 1
            sleep(backoff_seconds(attempt, nil))
            attempt += 1
            next
          end
          raise NetworkError.new("Request timed out", request_id: request_id, cause: e)
        rescue *TRANSPORT_ERRORS => e
          last_error = e
          if retryable && attempt < max_attempts - 1
            sleep(backoff_seconds(attempt, nil))
            attempt += 1
            next
          end
          raise NetworkError.new("Network request failed", request_id: request_id, cause: e)
        end
      end

      raise NetworkError.new("Request failed after retries", request_id: request_id, cause: last_error)
    end

    # Unwraps a { success, requestId, data } envelope to its data.
    def request_data(**params)
      result = request(**params)
      envelope = result.data
      Result.new(envelope["data"], result.status, envelope["requestId"] || result.request_id)
    end

    # Returns a full cursor page (keeps next_cursor/prev_cursor/total).
    def request_cursor_page(**params)
      request(**params)
    end

    private

    def can_retry?(method, idempotency_key)
      return true if IDEMPOTENT_METHODS.include?(method)

      # Writes are retried only when an idempotency key guards against duplicates.
      %w[POST PUT].include?(method) && !idempotency_key.nil?
    end

    def build_uri(path, query)
      uri = URI.join("#{@config.base_url}/", path.sub(%r{\A/}, ""))
      if query && !query.empty?
        pairs = query.filter_map do |key, value|
          next if value.nil?

          if value.is_a?(Array)
            next if value.empty?

            [key.to_s, value.join(",")]
          else
            [key.to_s, value.to_s]
          end
        end
        uri.query = URI.encode_www_form(pairs) unless pairs.empty?
      end
      uri
    end

    def perform(uri, method, body, idempotency_key, request_id, timeout_ms)
      timeout = (timeout_ms ? timeout_ms / 1000.0 : @config.timeout_seconds)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = timeout
      http.read_timeout = timeout
      http.request(build_request(uri, method, body, idempotency_key, request_id))
    end

    def build_request(uri, method, body, idempotency_key, request_id)
      klass = {
        "GET" => Net::HTTP::Get, "POST" => Net::HTTP::Post, "PUT" => Net::HTTP::Put,
        "PATCH" => Net::HTTP::Patch, "DELETE" => Net::HTTP::Delete,
      }.fetch(method)
      req = klass.new(uri)
      req["Accept"] = "application/json"
      req["X-Request-Id"] = request_id
      # The API key is a server-side secret; it is never read in browser code.
      req["Authorization"] = "Bearer #{@config.api_token}"
      req["Idempotency-Key"] = idempotency_key if idempotency_key
      unless body.nil?
        req["Content-Type"] = "application/json"
        req.body = JSON.generate(body)
      end
      req
    end

    def parse_body(response)
      text = response.body
      return nil if text.nil? || text.empty?

      content_type = response["content-type"] || ""
      if content_type.include?("json")
        begin
          JSON.parse(text)
        rescue JSON::ParserError
          text
        end
      else
        text
      end
    end

    def backoff_seconds(attempt, retry_after)
      if retry_after
        seconds = Float(retry_after, exception: false)
        return [seconds, 5.0].min if seconds
      end
      base = 0.2 * (2**attempt)
      jitter = deterministic_jitter(attempt) * 0.2
      [base + jitter, 5.0].min
    end

    # Small deterministic jitter keeps the reference reproducible without rand.
    def deterministic_jitter(attempt)
      x = Math.sin(attempt + 1) * 10_000
      x - x.floor
    end
  end
end
