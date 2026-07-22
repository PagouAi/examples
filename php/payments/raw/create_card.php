<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use Pagou\Examples\Format;
use Pagou\Examples\HttpClient;
use Pagou\Examples\Payments\DemoData;

// Backend half of the card flow. The `pgct_*` token is produced in the browser
// by the Payment Element (see ../card-element) and posted to your server; it is
// the ONLY card credential your backend ever sees — never a PAN or CVV.
// Run: PAGOU_CARD_TOKEN=pgct_... composer pay:card   (or pass the token as arg 1)
try {
    $token = $argv[1] ?? getenv('PAGOU_CARD_TOKEN') ?: null;
    if (!$token) {
        throw new \RuntimeException(
            'Provide a pgct_ token from the Payment Element (arg 1 or PAGOU_CARD_TOKEN). ' .
            'Start the browser demo with: composer pay:card:server',
        );
    }

    $client = new HttpClient();
    $input = [
        'amount' => 4900,
        'method' => 'credit_card',
        'currency' => 'BRL',
        'token' => $token,
        'installments' => 1,
        'buyer' => DemoData::buyer(),
        'products' => DemoData::products(),
        'external_ref' => 'card_' . (int) (microtime(true) * 1000),
    ];

    $result = $client->requestData(['method' => 'POST', 'path' => '/v2/transactions', 'body' => $input]);
    $tx = $result['data'];

    echo "Created {$tx['id']} — {$tx['status']} — " . Format::amount($tx['amount'], $tx['currency']) . PHP_EOL;

    if (($tx['status'] ?? null) === 'three_ds_required' && ($tx['next_action'] ?? null)) {
        // 3DS: return `next_action` to the browser so the Payment Element can open
        // the challenge. Do NOT fulfill here — wait for the confirmed webhook.
        Format::printResult('next_action (return to the browser to continue 3DS)', $tx['next_action']);
        exit(0);
    }

    echo 'No 3DS challenge required. Confirm the final state via webhook or reconciliation.' . PHP_EOL;
} catch (\Throwable $error) {
    fwrite(STDERR, $error . PHP_EOL);
    exit(1);
}
