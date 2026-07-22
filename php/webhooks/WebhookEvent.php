<?php

declare(strict_types=1);

namespace Pagou\Examples\Webhooks;

/** A parsed webhook, normalized across the three envelope families. */
final class WebhookEvent
{
    public function __construct(
        /** Top-level event id — the idempotency/dedupe key. */
        public readonly string $id,
        /** One of: transaction, subscription, transfer. */
        public readonly string $family,
        /** Concrete event name, e.g. `transaction.paid` or `payout.transferred`. */
        public readonly string $eventType,
        /** Public id of the affected resource, used to reconcile against the API. */
        public readonly string $resourceId,
        public readonly mixed $raw,
    ) {
    }
}
