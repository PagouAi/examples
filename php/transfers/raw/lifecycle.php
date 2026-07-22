<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use Pagou\Examples\ConflictError;
use Pagou\Examples\Format;
use Pagou\Examples\HttpClient;
use Pagou\Examples\Types;

// Pix Out lifecycle with the raw client: create → retrieve/reconcile → cancel.
// The final state (paid / rejected) arrives via the transfer webhook family;
// reconcile with GET when you need certainty. Note `amount` is a numeric cents
// value on input but a decimal string on responses.
// Run: composer transfers:demo
try {
    $client = new HttpClient();

    $externalRef = 'payout_' . (int) (microtime(true) * 1000);
    $input = [
        'pix_key_type' => 'EMAIL',
        'pix_key_value' => 'supplier@example.com',
        'amount' => 5000, // R$50.00 in cents (minimum is 1000)
        'description' => 'Supplier payout',
        'external_ref' => $externalRef,
    ];

    $created = $client->requestData([
        'method' => 'POST',
        'path' => '/v2/transfers',
        'body' => $input,
        'idempotencyKey' => Format::idempotencyKey('transfer', $externalRef),
    ])['data'];
    echo "Transfer {$created['id']} — {$created['status']} — amount(cents)={$created['amount']}" . PHP_EOL;

    // Reconcile: re-read the current state before acting on it.
    $current = $client->requestData(['method' => 'GET', 'path' => "/v2/transfers/{$created['id']}"])['data'];
    Format::printResult('Current state', [
        'id' => $current['id'] ?? null,
        'status' => $current['status'] ?? null,
        'fee' => $current['fee'] ?? null,
    ]);

    if (!in_array($current['status'] ?? '', Types::CANCELABLE_TRANSFER_STATUSES, true)) {
        echo "Status {$current['status']} is not cancelable; the final state will arrive by webhook." . PHP_EOL;
        exit(0);
    }

    try {
        $canceled = $client->requestData([
            'method' => 'POST',
            'path' => "/v2/transfers/{$created['id']}/cancel",
            'body' => ['reason' => 'wrong recipient'],
        ])['data'];
        echo "Canceled {$canceled['id']} — {$canceled['status']}" . PHP_EOL;
    } catch (ConflictError) {
        fwrite(STDERR, 'Already progressed past a cancelable state — reconcile via webhook/GET.' . PHP_EOL);
    }
} catch (\Throwable $error) {
    fwrite(STDERR, $error . PHP_EOL);
    exit(1);
}
