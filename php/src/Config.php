<?php

declare(strict_types=1);

namespace Pagou\Examples;

use Dotenv\Dotenv;

/**
 * Loads and validates configuration from the environment. The API token is a
 * server-side secret and is never exposed to the browser.
 */
final class Config
{
    private const SANDBOX_BASE_URL = 'https://api.sandbox.pagou.ai';
    private const PRODUCTION_BASE_URL = 'https://api.pagou.ai';

    public function __construct(
        public readonly string $environment,
        public readonly string $baseUrl,
        public readonly string $apiToken,
        public readonly ?string $webhookUrl,
        public readonly ?string $publishableKey,
        public readonly float $timeoutMs,
        public readonly int $maxRetries,
    ) {
    }

    public static function load(): self
    {
        self::loadDotenv();

        $environment = self::resolveEnvironment();

        return new self(
            environment: $environment,
            baseUrl: self::resolveBaseUrl($environment),
            apiToken: self::requireEnv('PAGOU_API_TOKEN'),
            webhookUrl: self::env('PAGOU_WEBHOOK_URL'),
            publishableKey: self::env('PAGOU_PUBLISHABLE_KEY'),
            timeoutMs: (float) (self::env('PAGOU_TIMEOUT_MS') ?? 30000),
            maxRetries: (int) (self::env('PAGOU_MAX_RETRIES') ?? 2),
        );
    }

    private static function loadDotenv(): void
    {
        $root = dirname(__DIR__);
        if (is_file($root . '/.env')) {
            Dotenv::createImmutable($root)->safeLoad();
        }
    }

    private static function env(string $name): ?string
    {
        $value = $_ENV[$name] ?? getenv($name);
        if ($value === false || $value === null || trim((string) $value) === '') {
            return null;
        }
        return (string) $value;
    }

    private static function requireEnv(string $name): string
    {
        $value = self::env($name);
        if ($value === null) {
            throw new \RuntimeException(
                "Missing required environment variable {$name}. Copy .env.example to .env and set it.",
            );
        }
        return $value;
    }

    private static function resolveEnvironment(): string
    {
        $raw = strtolower(self::env('PAGOU_ENVIRONMENT') ?? 'sandbox');
        if ($raw !== 'sandbox' && $raw !== 'production') {
            throw new \RuntimeException("PAGOU_ENVIRONMENT must be \"sandbox\" or \"production\", got \"{$raw}\".");
        }
        return $raw;
    }

    private static function resolveBaseUrl(string $environment): string
    {
        $override = self::env('PAGOU_BASE_URL');
        if ($override !== null) {
            return rtrim($override, '/');
        }
        return $environment === 'production' ? self::PRODUCTION_BASE_URL : self::SANDBOX_BASE_URL;
    }
}
