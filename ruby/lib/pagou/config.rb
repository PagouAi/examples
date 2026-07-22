# frozen_string_literal: true

module Pagou
  SANDBOX_BASE_URL = "https://api.sandbox.pagou.ai"
  PRODUCTION_BASE_URL = "https://api.pagou.ai"

  # Loaded configuration. The API token is a server-side secret and is never
  # exposed to the browser.
  Config = Struct.new(
    :environment, :base_url, :api_token, :webhook_url, :publishable_key,
    :timeout_ms, :max_retries,
    keyword_init: true,
  ) do
    def timeout_seconds
      timeout_ms / 1000.0
    end
  end

  # Loads and validates configuration from the environment.
  def self.load_config
    load_dotenv
    environment = resolve_environment
    Config.new(
      environment: environment,
      base_url: resolve_base_url(environment),
      api_token: require_env("PAGOU_API_TOKEN"),
      webhook_url: ENV.fetch("PAGOU_WEBHOOK_URL", nil),
      publishable_key: ENV.fetch("PAGOU_PUBLISHABLE_KEY", nil),
      timeout_ms: Integer(ENV.fetch("PAGOU_TIMEOUT_MS", "30000")),
      max_retries: Integer(ENV.fetch("PAGOU_MAX_RETRIES", "2")),
    )
  end

  def self.load_dotenv
    require "dotenv"
    Dotenv.load
  rescue LoadError
    # dotenv is optional: a real deployment sets env vars directly.
    nil
  end
  private_class_method :load_dotenv

  def self.require_env(name)
    value = ENV.fetch(name, nil)
    if value.nil? || value.strip.empty?
      raise "Missing required environment variable #{name}. Copy .env.example to .env and set it."
    end

    value
  end
  private_class_method :require_env

  def self.resolve_environment
    raw = (ENV["PAGOU_ENVIRONMENT"] || "sandbox").downcase
    unless %w[sandbox production].include?(raw)
      raise %(PAGOU_ENVIRONMENT must be "sandbox" or "production", got "#{raw}".)
    end

    raw
  end
  private_class_method :resolve_environment

  def self.resolve_base_url(environment)
    override = ENV["PAGOU_BASE_URL"]&.strip
    return override.sub(%r{/\z}, "") if override && !override.empty?

    environment == "production" ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL
  end
  private_class_method :resolve_base_url
end
