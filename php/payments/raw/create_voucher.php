<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use Pagou\Examples\Format;
use Pagou\Examples\HttpClient;
use Pagou\Examples\Payments\DemoData;

// Creates a voucher (boleto) charge. The printable instructions arrive
// asynchronously: the create response may return `status: pending` with the
// `voucher` block populated once the instrument is issued. Reconcile with a GET
// or a webhook to obtain the final barcode / digitable line / PDF URL.
// Run: composer pay:voucher
try {
    $client = new HttpClient();

    $input = [
        'amount' => 4900,
        'method' => 'voucher',
        'currency' => 'BRL',
        'buyer' => DemoData::buyer(),
        'products' => DemoData::products(),
        'external_ref' => 'voucher_' . (int) (microtime(true) * 1000),
    ];

    $result = $client->requestData(['method' => 'POST', 'path' => '/v2/transactions', 'body' => $input]);
    $tx = $result['data'];

    echo "Created {$tx['id']} — {$tx['status']} — " . Format::amount($tx['amount'], $tx['currency']) . PHP_EOL;
    if (($tx['voucher']['barcode'] ?? null) || ($tx['voucher']['url'] ?? null)) {
        Format::printResult('Voucher instructions', $tx['voucher']);
    } else {
        echo "Instructions not ready yet — reconcile {$tx['id']} via GET or wait for the webhook." . PHP_EOL;
    }
} catch (\Throwable $error) {
    fwrite(STDERR, $error . PHP_EOL);
    exit(1);
}
