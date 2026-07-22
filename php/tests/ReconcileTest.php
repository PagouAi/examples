<?php

declare(strict_types=1);

namespace Pagou\Examples\Tests;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use Pagou\Examples\Config;
use Pagou\Examples\HttpClient;
use Pagou\Examples\Reconcile;
use PHPUnit\Framework\TestCase;

final class ReconcileTest extends TestCase
{
    /** @param list<Response> $queue */
    private function client(array $queue): HttpClient
    {
        $config = new Config('sandbox', 'https://api.sandbox.pagou.ai', 'test', null, null, 1000, 0);
        $guzzle = new GuzzleClient(['handler' => HandlerStack::create(new MockHandler($queue)), 'http_errors' => false]);
        return new HttpClient($config, $guzzle);
    }

    private static function json(int $status, array $body): Response
    {
        return new Response($status, ['Content-Type' => 'application/json'], json_encode($body));
    }

    public function testFulfillsOnSettledStatuses(): void
    {
        self::assertSame(Reconcile::FULFILL, Reconcile::decideFulfillment('paid'));
        self::assertSame(Reconcile::FULFILL, Reconcile::decideFulfillment('captured'));
    }

    public function testWaitsOnNonTerminalStatuses(): void
    {
        self::assertSame(Reconcile::WAIT, Reconcile::decideFulfillment('pending'));
        self::assertSame(Reconcile::WAIT, Reconcile::decideFulfillment('three_ds_required'));
        self::assertSame(Reconcile::WAIT, Reconcile::decideFulfillment('processing'));
    }

    public function testCancelsOnTerminalFailures(): void
    {
        self::assertSame(Reconcile::CANCEL, Reconcile::decideFulfillment('expired'));
        self::assertSame(Reconcile::CANCEL, Reconcile::decideFulfillment('refused'));
        self::assertSame(Reconcile::CANCEL, Reconcile::decideFulfillment('canceled'));
    }

    public function testFetchesTransactionAndReturnsDecision(): void
    {
        $client = $this->client([self::json(200, ['success' => true, 'requestId' => 'r', 'data' => ['id' => 'tx_1', 'status' => 'paid']])]);
        $result = Reconcile::transaction('tx_1', $client);
        self::assertSame(Reconcile::FULFILL, $result['decision']);
        self::assertSame('paid', $result['transaction']['status']);
    }

    public function testReturnsNullWhenTransactionDoesNotExist(): void
    {
        $client = $this->client([self::json(404, ['message' => 'not found'])]);
        self::assertNull(Reconcile::transaction('missing', $client));
    }
}
