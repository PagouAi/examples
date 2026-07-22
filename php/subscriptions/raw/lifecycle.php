<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use Pagou\Examples\Format;
use Pagou\Examples\HttpClient;
use Pagou\Examples\Subscriptions\Customers;

// End-to-end subscription lifecycle with the raw client:
//   create/reuse customer → create subscription → retrieve → cancel.
// Renewal / failure / past-due / cancellation are delivered as webhooks
// (see ../../webhooks); business state changes only on those confirmed events.
// Run: PAGOU_CARD_TOKEN=pgct_... composer subs:demo
try {
    $token = getenv('PAGOU_CARD_TOKEN') ?: null;
    if (!$token) {
        throw new \RuntimeException('Set PAGOU_CARD_TOKEN to a pgct_ token from the Payment Element (subscription mode).');
    }

    $client = new HttpClient();

    $customer = Customers::createOrReuse($client);
    echo "Customer {$customer['id']} ({$customer['email']})" . PHP_EOL;

    $input = [
        'customer_id' => $customer['id'],
        'payment_method' => 'credit_card',
        'token' => $token,
        'interval' => 'month',
        'interval_count' => 1,
        'amount' => 4900,
        'currency' => 'BRL',
        'failure_policy' => 'retry_then_cancel',
        'retry_offsets_days' => [1, 3, 7],
        'products' => [['name' => 'Pro Plan', 'price' => 4900]],
    ];

    $result = $client->requestData([
        'method' => 'POST',
        'path' => '/v2/subscriptions',
        'body' => $input,
        // Idempotent create: a retry reuses the same subscription instead of a duplicate.
        'idempotencyKey' => Format::idempotencyKey('sub_create', $customer['id']),
    ]);
    $sub = $result['data'];
    echo "Subscription {$sub['id']} — {$sub['status']} — " . Format::amount($sub['amount'], $sub['currency']) . '/month' . PHP_EOL;

    $fetched = $client->requestData(['method' => 'GET', 'path' => "/v2/subscriptions/{$sub['id']}"])['data'];
    Format::printResult('Billed transactions', $fetched['transactions'] ?? []);

    $canceled = $client->requestData([
        'method' => 'POST',
        'path' => "/v2/subscriptions/{$sub['id']}/cancel",
        'body' => ['reason' => 'user_requested'],
    ])['data'];
    echo sprintf(
        'Canceled %s: cancelAtPeriodEnd=%s, canceledAt=%s',
        $canceled['id'],
        var_export($canceled['cancelAtPeriodEnd'] ?? null, true),
        var_export($canceled['canceledAt'] ?? null, true),
    ) . PHP_EOL;
} catch (\Throwable $error) {
    fwrite(STDERR, $error . PHP_EOL);
    exit(1);
}
