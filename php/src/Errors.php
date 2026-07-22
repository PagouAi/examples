<?php

declare(strict_types=1);

namespace Pagou\Examples;

/** Base class for every error surfaced by the reference HTTP client. */
class ApiError extends \RuntimeException
{
    public function __construct(
        string $message,
        public readonly ?int $status = null,
        public readonly ?string $errorCode = null,
        public readonly ?string $requestId = null,
        public readonly mixed $details = null,
        public readonly mixed $raw = null,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }
}

class AuthenticationError extends ApiError {} // 401
class PermissionError extends ApiError {} // 403
class InvalidRequestError extends ApiError {} // 400/422 and other 4xx
class NotFoundError extends ApiError {} // 404
class ConflictError extends ApiError {} // 409 (e.g. duplicate external_ref)
class RateLimitError extends ApiError {} // 429
class ServerError extends ApiError {} // 5xx
class NetworkError extends ApiError {} // transport failure / timeout

final class ErrorMapper
{
    /**
     * Normalizes the two documented error shapes: the simple
     * `{ error, message, status }` body and RFC 7807 `application/problem+json`
     * (`{ title, detail, errors[] }`), then maps the status to a typed error.
     */
    public static function fromResponse(int $status, mixed $body, ?string $requestIdFromHeader = null): ApiError
    {
        $obj = is_array($body) ? $body : [];

        $message = self::firstString($obj, ['message', 'detail', 'title', 'error']) ?? 'Request failed';
        $code = (isset($obj['code']) && is_string($obj['code']))
            ? $obj['code']
            : ((isset($obj['error']) && is_string($obj['error'])) ? $obj['error'] : null);
        $requestId = self::firstString($obj, ['requestId', 'request_id']) ?? $requestIdFromHeader;
        $details = $obj['errors'] ?? $obj['details'] ?? null;

        return match (true) {
            $status === 401 => new AuthenticationError($message, $status, $code, $requestId, $details, $body),
            $status === 403 => new PermissionError($message, $status, $code, $requestId, $details, $body),
            $status === 404 => new NotFoundError($message, $status, $code, $requestId, $details, $body),
            $status === 409 => new ConflictError($message, $status, $code, $requestId, $details, $body),
            $status === 429 => new RateLimitError($message, $status, $code, $requestId, $details, $body),
            $status >= 500 => new ServerError($message, $status, $code, $requestId, $details, $body),
            default => new InvalidRequestError($message, $status, $code, $requestId, $details, $body),
        };
    }

    /** @param array<string, mixed> $obj @param list<string> $keys */
    private static function firstString(array $obj, array $keys): ?string
    {
        foreach ($keys as $key) {
            if (isset($obj[$key]) && is_string($obj[$key]) && $obj[$key] !== '') {
                return $obj[$key];
            }
        }
        return null;
    }
}
