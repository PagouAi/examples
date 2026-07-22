<?php

declare(strict_types=1);

namespace Pagou\Examples\Tests;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
use Pagou\Examples\Config;
use Pagou\Examples\HttpClient;
use Pagou\Examples\NetworkError;
use Pagou\Examples\NotFoundError;
use Pagou\Examples\ServerError;
use PHPUnit\Framework\TestCase;

final class HttpClientTest extends TestCase
{
    /** @var list<array<string, mixed>> */
    private array $history = [];

    private function config(int $maxRetries = 1, float $timeoutMs = 1000): Config
    {
        return new Config(
            environment: 'sandbox',
            baseUrl: 'https://api.sandbox.pagou.ai',
            apiToken: 'test_token',
            webhookUrl: null,
            publishableKey: null,
            timeoutMs: $timeoutMs,
            maxRetries: $maxRetries,
        );
    }

    /** @param list<Response|\Throwable> $queue */
    private function client(array $queue, int $maxRetries = 1, float $timeoutMs = 1000): HttpClient
    {
        $this->history = [];
        $stack = HandlerStack::create(new MockHandler($queue));
        $stack->push(Middleware::history($this->history));
        $guzzle = new GuzzleClient(['handler' => $stack, 'http_errors' => false]);
        return new HttpClient($this->config($maxRetries, $timeoutMs), $guzzle);
    }

    private static function json(int $status, array $body, array $headers = []): Response
    {
        return new Response($status, ['Content-Type' => 'application/json', ...$headers], json_encode($body));
    }

    public function testUnwrapsDataEnvelope(): void
    {
        $client = $this->client([self::json(200, ['success' => true, 'requestId' => 'req_1', 'data' => ['id' => 'tx_1']])]);
        $result = $client->requestData(['method' => 'GET', 'path' => '/v2/transactions/tx_1']);
        self::assertSame('tx_1', $result['data']['id']);
        self::assertSame('req_1', $result['requestId']);
    }

    public function testSendsAuthorizationAndCorrelationId(): void
    {
        $client = $this->client([self::json(200, ['success' => true, 'requestId' => 'r', 'data' => []])]);
        $client->requestData(['method' => 'GET', 'path' => '/v2/transactions']);

        /** @var Request $request */
        $request = $this->history[0]['request'];
        self::assertSame('Bearer test_token', $request->getHeaderLine('Authorization'));
        self::assertMatchesRegularExpression('/[0-9a-f-]{36}/', $request->getHeaderLine('X-Request-Id'));
    }

    public function testMapsNotFoundWithoutRetrying(): void
    {
        $client = $this->client([self::json(404, ['message' => 'not found', 'code' => 'NOT_FOUND'])]);
        $this->expectException(NotFoundError::class);
        try {
            $client->requestData(['method' => 'GET', 'path' => '/v2/transactions/x']);
        } finally {
            self::assertCount(1, $this->history);
        }
    }

    public function testRetriesServerErrorOnGetThenSucceeds(): void
    {
        $client = $this->client([
            self::json(500, ['message' => 'boom']),
            self::json(200, ['success' => true, 'requestId' => 'r', 'data' => ['ok' => true]]),
        ]);
        $result = $client->requestData(['method' => 'GET', 'path' => '/v2/transactions']);
        self::assertTrue($result['data']['ok']);
        self::assertCount(2, $this->history);
    }

    public function testDoesNotRetryPostWithoutIdempotencyKey(): void
    {
        $client = $this->client([self::json(500, ['message' => 'boom'])]);
        $this->expectException(ServerError::class);
        try {
            $client->requestData(['method' => 'POST', 'path' => '/v2/transactions', 'body' => []]);
        } finally {
            self::assertCount(1, $this->history);
        }
    }

    public function testRetriesPostWhenIdempotencyKeyPresent(): void
    {
        $client = $this->client([
            self::json(503, ['message' => 'unavailable']),
            self::json(200, ['success' => true, 'requestId' => 'r', 'data' => ['id' => 'tx']]),
        ]);
        $result = $client->requestData([
            'method' => 'POST',
            'path' => '/v2/transactions',
            'body' => [],
            'idempotencyKey' => 'idem_1',
        ]);
        self::assertSame('tx', $result['data']['id']);
        /** @var Request $request */
        $request = $this->history[0]['request'];
        self::assertSame('idem_1', $request->getHeaderLine('Idempotency-Key'));
    }

    public function testRaisesNetworkErrorWithTimeoutMessage(): void
    {
        $client = $this->client(
            [new ConnectException('cURL error 28: Operation timed out', new Request('GET', 'https://api.sandbox.pagou.ai'))],
            maxRetries: 0,
        );
        try {
            $client->requestData(['method' => 'GET', 'path' => '/v2/transactions']);
            self::fail('Expected NetworkError');
        } catch (NetworkError $error) {
            self::assertSame('Request timed out', $error->getMessage());
        }
    }

    public function testSerializesArrayQueryParamsAsCommaJoined(): void
    {
        $client = $this->client([
            self::json(200, ['success' => true, 'requestId' => 'r', 'data' => [], 'next_cursor' => null, 'prev_cursor' => null, 'total' => 0]),
        ]);
        $client->requestCursorPage([
            'method' => 'GET',
            'path' => '/v2/transactions',
            'query' => ['paymentMethods' => ['pix', 'credit_card']],
        ]);

        /** @var Request $request */
        $request = $this->history[0]['request'];
        parse_str($request->getUri()->getQuery(), $params);
        self::assertSame('pix,credit_card', $params['paymentMethods']);
    }
}
