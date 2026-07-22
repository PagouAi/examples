<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use Pagou\Examples\Format;
use Pagou\Examples\HttpClient;
use Pagou\Examples\InvalidRequestError;
use Pagou\Examples\Payments\DemoData;

// Refunds a transaction. Omit the amount for a full refund; pass cents for a
// partial one. The refund is idempotent via an Idempotency-Key so a retry after
// a network blip never double-refunds.
// Run: composer pay:refund -- <transaction_id> [amount_cents]
try {
    $id = DemoData::resourceIdFromArgs('PAGOU_TRANSACTION_ID');
    $amountArg = $argv[2] ?? null;
    $amount = $amountArg !== null ? (int) $amountArg : null;
    $client = new HttpClient();

    $body = $amount !== null
        ? ['amount' => $amount, 'reason' => 'requested_by_customer']
        : ['reason' => 'requested_by_customer'];

    try {
        $result = $client->requestData([
            'method' => 'PUT',
            'path' => "/v2/transactions/{$id}/refund",
            'body' => $body,
            'idempotencyKey' => Format::idempotencyKey('refund', $id . '_' . ($amount ?? 'full')),
        ]);
        $refund = $result['data'];

        echo ($refund['is_full_refund'] ?? false) ? 'Full refund processed.' . PHP_EOL : 'Partial refund processed.' . PHP_EOL;
        Format::printResult('Refund', [
            'amount_refunded' => Format::amount((int) $refund['amount_refunded']),
            'remaining_balance' => Format::amount((int) $refund['remaining_balance']),
        ]);
    } catch (InvalidRequestError $error) {
        fwrite(STDERR, "Refund rejected: {$error->getMessage()}" . PHP_EOL);
    }
} catch (\Throwable $error) {
    fwrite(STDERR, $error . PHP_EOL);
    exit(1);
}
