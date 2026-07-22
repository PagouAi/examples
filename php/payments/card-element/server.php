<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use Pagou\Examples\Config;
use Pagou\Examples\HttpClient;
use Pagou\Examples\Logger;
use Pagou\Examples\Payments\DemoData;

// Minimal router for the browser card flow, served by PHP's built-in server. It
// serves the Payment Element page (injecting only the publishable key) and
// exposes POST /api/pay, which turns the browser's pgct_ token into a real
// charge via POST /v2/transactions.
// Run: composer pay:card:server   then open http://localhost:3000
$config = Config::load();
$client = new HttpClient($config);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if ($method === 'GET' && ($path === '/' || $path === '/index.html')) {
    $html = (string) file_get_contents(__DIR__ . '/index.html');
    $publishableKey = $config->publishableKey ?? 'pk_test_set_PAGOU_PUBLISHABLE_KEY';
    header('Content-Type: text/html');
    echo str_replace('__PUBLISHABLE_KEY__', $publishableKey, $html);
    return;
}

if ($method === 'POST' && $path === '/api/pay') {
    try {
        $payload = json_decode((string) file_get_contents('php://input'), true);
        $token = is_array($payload) ? ($payload['token'] ?? null) : null;
        if (!is_string($token) || !preg_match('/^pg(ct|pm)_/', $token)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'A pgct_/pgpm_ token is required.']);
            return;
        }

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

        // Return id/status/next_action so the browser SDK can continue 3DS.
        // Do NOT fulfill here — wait for the confirmed webhook.
        header('Content-Type: application/json');
        echo json_encode(['data' => [
            'id' => $tx['id'] ?? null,
            'status' => $tx['status'] ?? null,
            'next_action' => $tx['next_action'] ?? null,
        ]]);
    } catch (\Throwable $error) {
        Logger::error('Request failed', ['message' => $error->getMessage()]);
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Unexpected error']);
    }
    return;
}

http_response_code(404);
echo 'Not found';
