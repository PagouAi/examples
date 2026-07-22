# frozen_string_literal: true

require "json"
require "set"

module Pagou
  SENSITIVE_KEYS = %w[
    authorization apikey api_key token access_token client_secret secret
    password cvv cvc pan card_number number
  ].to_set.freeze

  TOKEN_PATTERNS = [
    /\bBearer\s+[A-Za-z0-9._-]+/i,
    /\bpg(ct|pm|sk|pk)_[A-Za-z0-9]+/,
  ].freeze

  REDACTED = "[REDACTED]"

  # Deep-copies a value with sensitive fields masked. Used before anything is
  # logged so secrets, tokens and card data never reach stdout or a log sink.
  def self.redact(value, seen = Set.new)
    case value
    when String
      TOKEN_PATTERNS.reduce(value) { |acc, pattern| acc.gsub(pattern, REDACTED) }
    when Hash
      return "[Circular]" if seen.include?(value.object_id)

      seen.add(value.object_id)
      value.each_with_object({}) do |(key, item), out|
        out[key] = SENSITIVE_KEYS.include?(key.to_s.downcase) ? REDACTED : redact(item, seen)
      end
    when Array
      return "[Circular]" if seen.include?(value.object_id)

      seen.add(value.object_id)
      value.map { |item| redact(item, seen) }
    else
      value
    end
  end

  # A tiny structured logger that redacts before writing. info -> stdout,
  # warn/error -> stderr, matching the reference implementation.
  class Logger
    LEVELS = { info: $stdout, warn: $stderr, error: $stderr }.freeze

    def info(message, context = nil)
      emit(:info, message, context)
    end

    def warn(message, context = nil)
      emit(:warn, message, context)
    end

    def error(message, context = nil)
      emit(:error, message, context)
    end

    private

    def emit(level, message, context)
      line = context ? "#{message} #{JSON.generate(Pagou.redact(context))}" : message
      LEVELS.fetch(level).puts(line)
    end
  end

  def self.logger
    @logger ||= Logger.new
  end
end
