<?php

declare(strict_types=1);

namespace Pagou\Examples;

final class Reconcile
{
    public const FULFILL = 'fulfill';
    public const WAIT = 'wait';
    public const CANCEL = 'cancel';

    /** Maps a transaction status to a business decision. Never fulfill on a pending state. */
    public static function decideFulfillment(string $status): string
    {
        if (in_array($status, Types::TERMINAL_PAID_STATUSES, true)) {
            return self::FULFILL;
        }
        if (in_array($status, Types::TERMINAL_FAILED_STATUSES, true)) {
            return self::CANCEL;
        }
        return self::WAIT;
    }

    /**
     * Server-side reconciliation: fetch the transaction from the API (the source
     * of truth) and decide whether to fulfill. Business state changes only on
     * this confirmed result, never on an unverified webhook body.
     *
     * @return array{transaction: array<string, mixed>, decision: string}|null
     */
    public static function transaction(string $id, ?HttpClient $client = null): ?array
    {
        $client ??= new HttpClient();
        try {
            $result = $client->requestData(['method' => 'GET', 'path' => "/v2/transactions/{$id}"]);
        } catch (NotFoundError) {
            return null;
        }

        $transaction = is_array($result['data']) ? $result['data'] : [];
        return [
            'transaction' => $transaction,
            'decision' => self::decideFulfillment((string) ($transaction['status'] ?? '')),
        ];
    }
}
