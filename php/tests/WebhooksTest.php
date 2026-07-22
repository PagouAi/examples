<?php

declare(strict_types=1);

namespace Pagou\Examples\Tests;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use Pagou\Examples\Config;
use Pagou\Examples\HttpClient;
use Pagou\Examples\Webhooks\Handlers;
use Pagou\Examples\Webhooks\Processor;
use Pagou\Examples\Webhooks\Store;
use Pagou\Examples\Webhooks\WebhookEvent;
use PHPUnit\Framework\TestCase;

final class WebhooksTest extends TestCase
{
    protected function setUp(): void
    {
        Store::usePath(sys_get_temp_dir() . '/pagou-webhooks-store.test.json');
        Store::reset();
    }

    protected function tearDown(): void
    {
        Store::reset();
    }

    private function loadFixture(string $name): array
    {
        return json_decode((string) file_get_contents(__DIR__ . '/fixtures/' . $name), true);
    }

    /** @param list<Response> $queue */
    private function client(array $queue): HttpClient
    {
        $config = new Config('sandbox', 'https://api.sandbox.pagou.ai', 'test', null, null, 1000, 0);
        $guzzle = new GuzzleClient(['handler' => HandlerStack::create(new MockHandler($queue)), 'http_errors' => false]);
        return new HttpClient($config, $guzzle);
    }

    public function testRoutesTransactionFamily(): void
    {
        $event = Handlers::parse(['id' => 'evt_1', 'event' => 'transaction', 'data' => ['id' => 'tx_1', 'event_type' => 'transaction.paid']]);
        self::assertInstanceOf(WebhookEvent::class, $event);
        self::assertSame('transaction', $event->family);
        self::assertSame('transaction.paid', $event->eventType);
        self::assertSame('tx_1', $event->resourceId);
    }

    public function testRoutesSubscriptionFamily(): void
    {
        $event = Handlers::parse(['id' => 'evt_2', 'event' => 'subscription', 'data' => ['id' => 'sub_1', 'event_type' => 'subscription.renewed']]);
        self::assertInstanceOf(WebhookEvent::class, $event);
        self::assertSame('subscription', $event->family);
        self::assertSame('sub_1', $event->resourceId);
    }

    public function testRoutesTransferFamily(): void
    {
        $event = Handlers::parse(['id' => 'evt_3', 'type' => 'payout.transferred', 'data' => ['object' => ['id' => 'tr_1']]]);
        self::assertInstanceOf(WebhookEvent::class, $event);
        self::assertSame('transfer', $event->family);
        self::assertSame('payout.transferred', $event->eventType);
        self::assertSame('tr_1', $event->resourceId);
    }

    public function testRejectsBodyWithoutEventId(): void
    {
        self::assertSame(['error' => 'missing_event_id'], Handlers::parse(['event' => 'transaction', 'data' => []]));
    }

    public function testParsesEachFamilyFixture(): void
    {
        foreach (['webhook.transaction.json', 'webhook.subscription.json', 'webhook.transfer.json'] as $name) {
            self::assertInstanceOf(WebhookEvent::class, Handlers::parse($this->loadFixture($name)));
        }
    }

    public function testIsConfirmedStateChange(): void
    {
        self::assertTrue(Handlers::isConfirmedStateChange('transaction.paid'));
        self::assertTrue(Handlers::isConfirmedStateChange('payout.transferred'));
        self::assertFalse(Handlers::isConfirmedStateChange('transaction.created'));
        self::assertFalse(Handlers::isConfirmedStateChange('subscription.trial_will_end'));
    }

    public function testDedupeReturnsTrueOnceThenFalse(): void
    {
        self::assertTrue(Store::markProcessed('evt_x'));
        self::assertFalse(Store::markProcessed('evt_x'));
    }

    public function testProcessReconcilesAndUpdatesStateOnConfirmedEvent(): void
    {
        $client = $this->client([new Response(200, ['Content-Type' => 'application/json'], json_encode(['success' => true, 'requestId' => 'r', 'data' => ['status' => 'paid']]))]);
        Processor::process(new WebhookEvent('evt_1', 'transaction', 'transaction.paid', 'tx_1', []), $client);
        self::assertSame('paid', Store::getResourceState('tx_1'));
    }

    public function testProcessDoesNotChangeStateOnNonConfirmingEvent(): void
    {
        $client = $this->client([]);
        Processor::process(new WebhookEvent('evt_2', 'transaction', 'transaction.created', 'tx_2', []), $client);
        self::assertNull(Store::getResourceState('tx_2'));
    }

    public function testProcessSkipsWhenConfirmedEventHasNoResourceId(): void
    {
        $client = $this->client([]);
        Processor::process(new WebhookEvent('evt_3', 'transaction', 'transaction.paid', '', []), $client);
        self::assertNull(Store::getResourceState(''));
    }

    public function testProcessLeavesStateUnchangedWhenResourceNotFound(): void
    {
        $client = $this->client([new Response(404, ['Content-Type' => 'application/json'], json_encode(['message' => 'not found']))]);
        Processor::process(new WebhookEvent('evt_4', 'transfer', 'payout.transferred', 'tr_x', []), $client);
        self::assertNull(Store::getResourceState('tr_x'));
    }
}
