<?php

declare(strict_types=1);

namespace Pagou\Examples;

/**
 * Deep-masks sensitive fields before anything is logged, so secrets, tokens and
 * card data never reach stdout or a log sink.
 */
final class Logger
{
    private const REDACTED = '[REDACTED]';

    private const SENSITIVE_KEYS = [
        'authorization', 'apikey', 'api_key', 'token', 'access_token',
        'client_secret', 'secret', 'password', 'cvv', 'cvc', 'pan',
        'card_number', 'number',
    ];

    private const TOKEN_PATTERNS = [
        '/\bBearer\s+[A-Za-z0-9._-]+/i',
        '/\bpg(ct|pm|sk|pk)_[A-Za-z0-9]+/',
    ];

    public static function redact(mixed $value): mixed
    {
        if (is_string($value)) {
            return preg_replace(self::TOKEN_PATTERNS, self::REDACTED, $value);
        }
        if (!is_array($value)) {
            return $value;
        }

        $out = [];
        foreach ($value as $key => $item) {
            $out[$key] = in_array(strtolower((string) $key), self::SENSITIVE_KEYS, true)
                ? self::REDACTED
                : self::redact($item);
        }
        return $out;
    }

    public static function info(string $message, ?array $context = null): void
    {
        self::emit('php://stdout', $message, $context);
    }

    public static function warn(string $message, ?array $context = null): void
    {
        self::emit('php://stderr', $message, $context);
    }

    public static function error(string $message, ?array $context = null): void
    {
        self::emit('php://stderr', $message, $context);
    }

    private static function emit(string $stream, string $message, ?array $context): void
    {
        $line = $context !== null
            ? $message . ' ' . json_encode(self::redact($context), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            : $message;
        file_put_contents($stream, $line . PHP_EOL);
    }
}
