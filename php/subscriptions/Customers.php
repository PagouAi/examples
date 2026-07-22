<?php

declare(strict_types=1);

namespace Pagou\Examples\Subscriptions;

use Pagou\Examples\HttpClient;

// Customers are not an SDK resource in any language; both the subscription
// examples create/reuse a customer through the raw HTTP client.
final class Customers
{
    /**
     * Reuses PAGOU_CUSTOMER_ID when set, otherwise creates a fresh customer.
     * @return array<string, mixed>
     */
    public static function createOrReuse(HttpClient $client): array
    {
        $existing = getenv('PAGOU_CUSTOMER_ID') ?: null;
        if ($existing) {
            $result = $client->requestData(['method' => 'GET', 'path' => "/v2/customers/{$existing}"]);
            return $result['data'];
        }

        $suffix = (int) (microtime(true) * 1000);
        $input = [
            'name' => 'Ana Souza',
            'email' => "ana.souza+{$suffix}@example.com",
            'document' => ['type' => 'CPF', 'number' => '19100000000'],
            'phone' => '11999990000',
            'externalRef' => "cust_{$suffix}",
        ];

        $result = $client->requestData(['method' => 'POST', 'path' => '/v2/customers', 'body' => $input]);
        return $result['data'];
    }
}
