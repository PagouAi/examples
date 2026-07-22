<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use Pagou\Examples\HttpClient;

// Lists transactions with cursor pagination. Filters use camelCase query names
// (`paymentMethods`), while the envelope cursors are snake_case
// (`next_cursor` / `prev_cursor`). Walks up to three pages forward.
// Run: composer pay:list
try {
    $client = new HttpClient();
    $cursor = null;

    for ($pageNum = 1; $pageNum <= 3; $pageNum++) {
        $query = ['limit' => 5, 'paymentMethods' => ['pix', 'credit_card']];
        if ($cursor !== null) {
            $query['cursor'] = $cursor;
            $query['direction'] = 'next';
        }
        $result = $client->requestCursorPage(['method' => 'GET', 'path' => '/v2/transactions', 'query' => $query]);
        $page = $result['data'];

        $items = $page['data'] ?? [];
        echo PHP_EOL . "Page {$pageNum} — " . count($items) . ' of ' . ($page['total'] ?? 0) . ' total' . PHP_EOL;
        foreach ($items as $item) {
            $status = str_pad((string) $item['status'], 18);
            echo "  {$item['id']}  {$status}  {$item['payment']['method']}  {$item['payment']['amount']}" . PHP_EOL;
        }

        if (empty($page['next_cursor'])) {
            echo PHP_EOL . 'No more pages.' . PHP_EOL;
            break;
        }
        $cursor = $page['next_cursor'];
    }
} catch (\Throwable $error) {
    fwrite(STDERR, $error . PHP_EOL);
    exit(1);
}
