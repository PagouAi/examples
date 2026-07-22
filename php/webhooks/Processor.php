<?php

declare(strict_types=1);

namespace Pagou\Examples\Webhooks;

use Pagou\Examples\HttpClient;
use Pagou\Examples\Logger;
use Pagou\Examples\NotFoundError;

/**
 * The offloaded, slow half of webhook handling. It runs AFTER the fast 2xx ack.
 * Business state changes only on a confirmed event, and only after reconciling
 * against the API — the webhook body is a hint, the API is the source of truth.
 */
final class Processor
{
    private const RESOURCE_PATH = [
        'transaction' => '/v2/transactions',
        'subscription' => '/v2/subscriptions',
        'transfer' => '/v2/transfers',
    ];

    public static function process(WebhookEvent $event, ?HttpClient $client = null): void
    {
        if (!Handlers::isConfirmedStateChange($event->eventType)) {
            Logger::info("Ignoring non-confirming event {$event->eventType} ({$event->id})");
            return;
        }
        if ($event->resourceId === '') {
            Logger::warn("Confirmed event {$event->eventType} without a resource id — cannot reconcile.");
            return;
        }

        $client ??= new HttpClient();
        try {
            $result = $client->requestData([
                'method' => 'GET',
                'path' => self::RESOURCE_PATH[$event->family] . '/' . $event->resourceId,
            ]);
            $status = (string) ($result['data']['status'] ?? '');
            Store::setResourceState($event->resourceId, $status);
            Logger::info("Reconciled {$event->family} {$event->resourceId} → {$status}");
        } catch (NotFoundError) {
            Logger::warn("Resource {$event->resourceId} not found during reconciliation.");
        } catch (\Throwable $error) {
            // Reconciliation failed after the ack: a real system would requeue this
            // event for a later retry rather than replaying side effects.
            Logger::error("Reconciliation failed for {$event->id}", ['message' => $error->getMessage()]);
            throw $error;
        }
    }
}
