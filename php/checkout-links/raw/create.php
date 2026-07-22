<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use Pagou\Examples\Format;
use Pagou\Examples\HttpClient;

// Creates a hosted checkout link. The v2 contract exposes only POST — the
// returned public identifier is the checkout URL itself (`data.url`); persist
// it to share with the buyer. There is no retrieve/list endpoint.
// Run: composer checkout:create
try {
    $client = new HttpClient();

    $input = [
        'title' => 'Pro Plan',
        'currency' => 'BRL',
        'products' => [
            ['external_id' => 'pro-plan', 'name' => 'Pro Plan', 'price' => 4900, 'quantity' => 1, 'type' => 'digital'],
        ],
    ];

    $result = $client->requestData(['method' => 'POST', 'path' => '/v2/checkout-links', 'body' => $input]);

    // Persist the URL — it is the only handle to the link.
    Format::printResult('Checkout link (store this URL)', $result['data']['url'] ?? null);
} catch (\Throwable $error) {
    fwrite(STDERR, $error . PHP_EOL);
    exit(1);
}
