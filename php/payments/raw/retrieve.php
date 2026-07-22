<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use Pagou\Examples\Format;
use Pagou\Examples\HttpClient;
use Pagou\Examples\NotFoundError;
use Pagou\Examples\Payments\DemoData;

// Retrieves a transaction by its public UUID.
// Run: composer pay:retrieve -- <transaction_id>
try {
    $id = DemoData::resourceIdFromArgs('PAGOU_TRANSACTION_ID');
    $client = new HttpClient();

    try {
        $result = $client->requestData(['method' => 'GET', 'path' => "/v2/transactions/{$id}"]);
        $tx = $result['data'];
        Format::printResult('Transaction', [
            'id' => $tx['id'] ?? null,
            'status' => $tx['status'] ?? null,
            'amount' => $tx['amount'] ?? null,
            'paid_amount' => $tx['paid_amount'] ?? null,
            'refunded_amount' => $tx['refunded_amount'] ?? null,
            'paid_at' => $tx['paid_at'] ?? null,
        ]);
    } catch (NotFoundError) {
        fwrite(STDERR, "No transaction {$id}." . PHP_EOL);
    }
} catch (\Throwable $error) {
    fwrite(STDERR, $error . PHP_EOL);
    exit(1);
}
