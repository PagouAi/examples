<?php

declare(strict_types=1);

namespace Pagou\Examples;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Psr7\Request;
use Psr\Http\Message\ResponseInterface;

/**
 * Minimal reference client for the Pagou API v2 built on Guzzle. It demonstrates
 * the fundamentals every language example must show: server-side auth,
 * correlation ids, idempotency keys, timeouts, bounded retries for transient
 * failures on idempotent operations, typed errors and redacted logging.
 */
final class HttpClient
{
    private const RETRYABLE_STATUS = [429, 500, 502, 503, 504];
    private const IDEMPOTENT_METHODS = ['GET', 'HEAD'];

    private readonly Config $config;
    private readonly ClientInterface $http;

    public function __construct(?Config $config = null, ?ClientInterface $http = null)
    {
        $this->config = $config ?? Config::load();
        // `http_errors => false` lets us inspect the status ourselves and map it
        // to a typed error, exactly as the reference does on the wire.
        $this->http = $http ?? new GuzzleClient(['http_errors' => false]);
    }

    /**
     * @param array{
     *   method: string, path: string, query?: array<string, mixed>, body?: mixed,
     *   idempotencyKey?: string, requestId?: string, timeoutMs?: float
     * } $params
     * @return array{data: mixed, status: int, requestId: ?string}
     */
    public function request(array $params): array
    {
        $method = strtoupper($params['method']);
        $requestId = $params['requestId'] ?? self::uuidV4();
        $uri = $this->buildUrl($params['path'], $params['query'] ?? null);
        $retryable = $this->canRetry($method, $params['idempotencyKey'] ?? null);
        $maxAttempts = $retryable ? $this->config->maxRetries + 1 : 1;
        $timeoutSeconds = ($params['timeoutMs'] ?? $this->config->timeoutMs) / 1000;

        Logger::info("→ {$method} {$uri}", ['requestId' => $requestId, 'body' => $params['body'] ?? null]);

        $lastError = null;
        for ($attempt = 0; $attempt < $maxAttempts; $attempt++) {
            $request = new Request($method, $uri, $this->buildHeaders($params, $requestId), $this->encodeBody($params));

            try {
                $response = $this->http->send($request, [
                    'timeout' => $timeoutSeconds,
                    'connect_timeout' => $timeoutSeconds,
                ]);
            } catch (GuzzleException $error) {
                $lastError = $error;
                // Retry transport failures/timeouts on idempotent operations only.
                if ($retryable && $attempt < $maxAttempts - 1) {
                    usleep((int) (self::backoffMs($attempt, null) * 1000));
                    continue;
                }
                throw new NetworkError(
                    self::isTimeout($error) ? 'Request timed out' : 'Network request failed',
                    requestId: $requestId,
                    previous: $error,
                );
            }

            $status = $response->getStatusCode();
            $responseId = $response->getHeaderLine('x-request-id') ?: $requestId;
            $payload = self::parseBody($response);

            if ($status >= 400) {
                if ($retryable && in_array($status, self::RETRYABLE_STATUS, true) && $attempt < $maxAttempts - 1) {
                    usleep((int) (self::backoffMs($attempt, $response->getHeaderLine('Retry-After') ?: null) * 1000));
                    continue;
                }
                $error = ErrorMapper::fromResponse($status, $payload, $responseId);
                Logger::warn("← {$status} {$method} {$uri}", ['requestId' => $responseId, 'code' => $error->errorCode]);
                throw $error;
            }

            Logger::info("← {$status} {$method} {$uri}", ['requestId' => $responseId]);
            return ['data' => $payload, 'status' => $status, 'requestId' => $responseId];
        }

        throw new NetworkError('Request failed after retries', requestId: $requestId, previous: $lastError);
    }

    /**
     * Unwraps a `{ success, requestId, data }` envelope to its `data`.
     * @return array{data: mixed, status: int, requestId: ?string}
     */
    public function requestData(array $params): array
    {
        $result = $this->request($params);
        $envelope = is_array($result['data']) ? $result['data'] : [];
        return [
            'data' => $envelope['data'] ?? null,
            'status' => $result['status'],
            'requestId' => (isset($envelope['requestId']) && is_string($envelope['requestId']))
                ? $envelope['requestId']
                : $result['requestId'],
        ];
    }

    /**
     * Returns a full cursor page (keeps `next_cursor`/`prev_cursor`/`total`).
     * @return array{data: mixed, status: int, requestId: ?string}
     */
    public function requestCursorPage(array $params): array
    {
        return $this->request($params);
    }

    private function buildUrl(string $path, ?array $query): string
    {
        $url = rtrim($this->config->baseUrl, '/') . '/' . ltrim($path, '/');
        if ($query) {
            $pairs = [];
            foreach ($query as $key => $value) {
                if ($value === null) {
                    continue;
                }
                if (is_array($value)) {
                    if ($value === []) {
                        continue;
                    }
                    $pairs[$key] = implode(',', array_map(self::stringify(...), $value));
                } else {
                    $pairs[$key] = self::stringify($value);
                }
            }
            if ($pairs !== []) {
                $url .= '?' . http_build_query($pairs);
            }
        }
        return $url;
    }

    /** @return array<string, string> */
    private function buildHeaders(array $params, string $requestId): array
    {
        $headers = [
            'Accept' => 'application/json',
            'X-Request-Id' => $requestId,
            // The API key is a server-side secret; it is never read in browser code.
            'Authorization' => 'Bearer ' . $this->config->apiToken,
        ];
        if (isset($params['idempotencyKey'])) {
            $headers['Idempotency-Key'] = $params['idempotencyKey'];
        }
        if (array_key_exists('body', $params) && $params['body'] !== null) {
            $headers['Content-Type'] = 'application/json';
        }
        return $headers;
    }

    private function encodeBody(array $params): ?string
    {
        if (!array_key_exists('body', $params) || $params['body'] === null) {
            return null;
        }
        return json_encode($params['body'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    private function canRetry(string $method, ?string $idempotencyKey): bool
    {
        if (in_array($method, self::IDEMPOTENT_METHODS, true)) {
            return true;
        }
        // Writes are retried only when an idempotency key guards against duplicates.
        return ($method === 'POST' || $method === 'PUT') && $idempotencyKey !== null;
    }

    private static function parseBody(ResponseInterface $response): mixed
    {
        $text = (string) $response->getBody();
        if ($text === '') {
            return null;
        }
        if (str_contains($response->getHeaderLine('content-type'), 'json')) {
            $decoded = json_decode($text, true);
            return json_last_error() === JSON_ERROR_NONE ? $decoded : $text;
        }
        return $text;
    }

    private static function isTimeout(GuzzleException $error): bool
    {
        return $error instanceof \GuzzleHttp\Exception\ConnectException
            && str_contains(strtolower($error->getMessage()), 'timed out');
    }

    private static function backoffMs(int $attempt, ?string $retryAfter): float
    {
        if ($retryAfter !== null && is_numeric($retryAfter)) {
            return min((float) $retryAfter * 1000, 5000);
        }
        $base = 200 * (2 ** $attempt);
        // Small deterministic jitter keeps the reference reproducible.
        $jitter = (int) (self::deterministicJitter($attempt) * 200);
        return min($base + $jitter, 5000);
    }

    private static function deterministicJitter(int $attempt): float
    {
        $x = sin($attempt + 1) * 10000;
        return $x - floor($x);
    }

    private static function stringify(mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        return (string) $value;
    }

    private static function uuidV4(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}
