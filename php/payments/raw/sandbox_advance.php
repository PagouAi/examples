<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use Pagou\Examples\Format;
use Pagou\Examples\HttpClient;
use Pagou\Examples\Payments\DemoData;

// Sandbox-only helper: forces a transaction to a target status so you can
// exercise the paid/refunded paths without a real payer. Never available in
// production. Run: composer pay:pix, then:
// php payments/raw/sandbox_advance.php <transaction_id> [status=paid]
try {
    $id = DemoData::resourceIdFromArgs('PAGOU_TRANSACTION_ID');
    $status = $argv[2] ?? 'paid';
    $client = new HttpClient();

    $result = $client->requestData([
        'method' => 'PUT',
        'path' => "/v2/transactions/{$id}",
        'body' => ['status' => $status],
    ]);

    Format::printResult('Sandbox transaction updated', $result['data']['transaction'] ?? $result['data']);
} catch (\Throwable $error) {
    fwrite(STDERR, $error . PHP_EOL);
    exit(1);
}
