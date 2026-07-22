<?php

declare(strict_types=1);

namespace Pagou\Examples\Webhooks;

// Parsing for the three webhook envelope families. The public contract exposes
// no signature header, so authenticity is established downstream by reconciling
// against the API — never by trusting these bodies. Every family carries a
// top-level `id` that is THE dedupe key (a resource emits many events over time,
// so deduping by resource id would drop distinct events).
final class Handlers
{
    /** Event types that assert a confirmed, fulfillable state change. */
    private const CONFIRMED_EVENTS = [
        'transaction.paid',
        'transaction.refunded',
        'transaction.partially_refunded',
        'transaction.chargedback',
        'subscription.renewed',
        'subscription.payment_failed',
        'subscription.past_due',
        'subscription.canceled',
        'payout.transferred',
        'payout.failed',
        'payout.rejected',
        'payout.canceled',
    ];

    /**
     * Routes a raw webhook body to one of the three families and extracts the
     * dedupe id, event type and resource id. Returns `['error' => ...]` instead
     * of throwing so the server can answer with the documented error body.
     *
     * @return WebhookEvent|array{error: string}
     */
    public static function parse(mixed $body): WebhookEvent|array
    {
        if (!is_array($body)) {
            return ['error' => 'unknown_envelope'];
        }

        $id = isset($body['id']) && is_string($body['id']) ? $body['id'] : null;
        if ($id === null) {
            return ['error' => 'missing_event_id'];
        }

        // Transactions: envelope `event = "transaction"`, name in `data.event_type`.
        if (($body['event'] ?? null) === 'transaction') {
            $data = is_array($body['data'] ?? null) ? $body['data'] : [];
            return new WebhookEvent(
                $id,
                'transaction',
                (string) ($data['event_type'] ?? 'transaction.unknown'),
                (string) ($data['id'] ?? ''),
                $body,
            );
        }

        // Subscriptions: envelope `event = "subscription"`, name in `data.event_type`.
        if (($body['event'] ?? null) === 'subscription') {
            $data = is_array($body['data'] ?? null) ? $body['data'] : [];
            return new WebhookEvent(
                $id,
                'subscription',
                (string) ($data['event_type'] ?? 'subscription.unknown'),
                (string) ($data['id'] ?? ''),
                $body,
            );
        }

        // Transfers: top-level `type`, resource in `data.object`.
        if (isset($body['type']) && is_string($body['type'])) {
            $data = is_array($body['data'] ?? null) ? $body['data'] : [];
            $object = is_array($data['object'] ?? null) ? $data['object'] : [];
            return new WebhookEvent(
                $id,
                'transfer',
                $body['type'],
                (string) ($object['id'] ?? ''),
                $body,
            );
        }

        return ['error' => 'unknown_envelope'];
    }

    /** Whether an event should trigger reconciliation + a business-state change. */
    public static function isConfirmedStateChange(string $eventType): bool
    {
        return in_array($eventType, self::CONFIRMED_EVENTS, true);
    }
}
