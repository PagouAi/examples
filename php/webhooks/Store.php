<?php

declare(strict_types=1);

namespace Pagou\Examples\Webhooks;

// File-backed persistence stand-ins. Unlike a long-lived server, PHP handles
// each request in a fresh process, so idempotency state must live outside the
// request. A real integration would back these with a database: the
// processed-events table gives idempotency across redeliveries, and the
// business-state table is the record you actually fulfill against.
final class Store
{
    private static ?string $path = null;

    /** Overrides the backing file (used by tests for isolation). */
    public static function usePath(?string $path): void
    {
        self::$path = $path;
    }

    /** True the first time an event id is seen; false for any redelivery. */
    public static function markProcessed(string $eventId): bool
    {
        $state = self::read();
        if (in_array($eventId, $state['processed'], true)) {
            return false;
        }
        $state['processed'][] = $eventId;
        self::write($state);
        return true;
    }

    public static function hasProcessed(string $eventId): bool
    {
        return in_array($eventId, self::read()['processed'], true);
    }

    /** Records the reconciled state of a resource (the fulfillable source of truth). */
    public static function setResourceState(string $resourceId, string $state): void
    {
        $store = self::read();
        $store['resources'][$resourceId] = $state;
        self::write($store);
    }

    public static function getResourceState(string $resourceId): ?string
    {
        return self::read()['resources'][$resourceId] ?? null;
    }

    /** Test/support helper to reset the backing store. */
    public static function reset(): void
    {
        $path = self::path();
        if (is_file($path)) {
            unlink($path);
        }
    }

    private static function path(): string
    {
        return self::$path ??= sys_get_temp_dir() . '/pagou-webhooks-store.json';
    }

    /** @return array{processed: list<string>, resources: array<string, string>} */
    private static function read(): array
    {
        $path = self::path();
        if (!is_file($path)) {
            return ['processed' => [], 'resources' => []];
        }
        $decoded = json_decode((string) file_get_contents($path), true);
        return is_array($decoded)
            ? ['processed' => $decoded['processed'] ?? [], 'resources' => $decoded['resources'] ?? []]
            : ['processed' => [], 'resources' => []];
    }

    /** @param array{processed: list<string>, resources: array<string, string>} $state */
    private static function write(array $state): void
    {
        file_put_contents(self::path(), json_encode($state), LOCK_EX);
    }
}
