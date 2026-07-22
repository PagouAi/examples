<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use Pagou\Examples\ConflictError;
use Pagou\Examples\Format;
use Pagou\Examples\HttpClient;
use Pagou\Examples\Payments\DemoData;

// Creates a Pix charge and returns the copy-and-paste QR payload (`pix.qr_code`).
// Run: composer pay:pix
try {
    $client = new HttpClient();

    $input = [
        'amount' => 4900,
        'method' => 'pix',
        'currency' => 'BRL',
        'buyer' => DemoData::buyer(),
        'products' => DemoData::products(),
        // `external_ref` doubles as a natural idempotency key: a duplicate value
        // is rejected with 409 DUPLICATE_EXTERNAL_REF instead of double-charging.
        'external_ref' => 'order_' . (int) (microtime(true) * 1000),
    ];

    try {
        $result = $client->requestData(['method' => 'POST', 'path' => '/v2/transactions', 'body' => $input]);
        $tx = $result['data'];

        echo "Created {$tx['id']} — {$tx['status']} — " . Format::amount($tx['amount'], $tx['currency']) . PHP_EOL;
        Format::printResult('Pix QR (copy and paste)', $tx['pix']['qr_code'] ?? null);
        Format::printResult('Expires at', $tx['pix']['expiration_date'] ?? null);
    } catch (ConflictError) {
        fwrite(STDERR, 'Duplicate external_ref — this charge was already created.' . PHP_EOL);
    }
} catch (\Throwable $error) {
    fwrite(STDERR, $error . PHP_EOL);
    exit(1);
}
