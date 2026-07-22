# frozen_string_literal: true

module Pagou
  # Base class for every error surfaced by the HTTP reference client.
  class ApiError < StandardError
    attr_reader :status, :code, :request_id, :details, :raw

    def initialize(message, status: nil, code: nil, request_id: nil, details: nil, raw: nil, cause: nil)
      super(message)
      @status = status
      @code = code
      @request_id = request_id
      @details = details
      @raw = raw
      @cause_error = cause
    end

    # Ruby sets #cause automatically inside a rescue; expose an explicit one too.
    def cause
      @cause_error || super
    end
  end

  # 401
  class AuthenticationError < ApiError; end
  # 403
  class PermissionError < ApiError; end
  # 400/422 and other 4xx
  class InvalidRequestError < ApiError; end
  # 404
  class NotFoundError < ApiError; end
  # 409 (e.g. duplicate external_ref)
  class ConflictError < ApiError; end
  # 429
  class RateLimitError < ApiError; end
  # 5xx
  class ServerError < ApiError; end
  # transport failure / timeout
  class NetworkError < ApiError; end

  # Normalizes the two documented error shapes: the simple
  # { error, message, status } body and RFC 7807 application/problem+json
  # ({ title, detail, errors[] }).
  def self.parse_error_body(body, fallback_request_id = nil)
    return { message: "Request failed", request_id: fallback_request_id } unless body.is_a?(Hash)

    message = string_or_nil(body["message"]) || string_or_nil(body["detail"]) ||
              string_or_nil(body["title"]) || string_or_nil(body["error"]) || "Request failed"
    code = string_or_nil(body["code"]) || string_or_nil(body["error"])
    request_id = string_or_nil(body["requestId"]) || string_or_nil(body["request_id"]) || fallback_request_id
    details = body["errors"] || body["details"]
    { message: message, code: code, request_id: request_id, details: details }
  end

  # Maps an HTTP status + response body to the matching typed error.
  def self.to_api_error(status, body, request_id_from_header = nil)
    parsed = parse_error_body(body, request_id_from_header)
    klass = case status
            when 401 then AuthenticationError
            when 403 then PermissionError
            when 404 then NotFoundError
            when 409 then ConflictError
            when 429 then RateLimitError
            else status >= 500 ? ServerError : InvalidRequestError
            end
    klass.new(
      parsed[:message],
      status: status,
      code: parsed[:code],
      request_id: parsed[:request_id],
      details: parsed[:details],
      raw: body,
    )
  end

  def self.string_or_nil(value)
    value.is_a?(String) && !value.empty? ? value : nil
  end
  private_class_method :string_or_nil
end
