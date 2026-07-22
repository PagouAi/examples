<?php

declare(strict_types=1);

namespace Pagou\Examples\Payments;

final class DemoData
{
    /**
     * Synthetic buyer data — safe to commit. Never use real documents or PII.
     * @return array<string, mixed>
     */
    public static function buyer(): array
    {
        return [
            'name' => 'Ana Souza',
            'email' => 'ana.souza@example.com',
            'document' => ['type' => 'CPF', 'number' => '19100000000'],
        ];
    }

    /** @return list<array<string, mixed>> */
    public static function products(): array
    {
        return [['name' => 'Pro Plan', 'price' => 4900, 'quantity' => 1]];
    }

    /** Reads a resource id from the first CLI argument or an env var. */
    public static function resourceIdFromArgs(string $envVar): string
    {
        $id = $GLOBALS['argv'][1] ?? getenv($envVar) ?: null;
        if (!$id) {
            throw new \RuntimeException("Pass a resource id as the first argument or set {$envVar}.");
        }
        return (string) $id;
    }
}
