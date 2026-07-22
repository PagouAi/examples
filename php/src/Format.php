<?php

declare(strict_types=1);

namespace Pagou\Examples;

use NumberFormatter;

final class Format
{
    /** Formats an integer amount in the smallest currency unit as a display string. */
    public static function amount(int $cents, string $currency = 'BRL'): string
    {
        if (class_exists(NumberFormatter::class)) {
            $formatter = new NumberFormatter('pt_BR', NumberFormatter::CURRENCY);
            return (string) $formatter->formatCurrency($cents / 100, $currency);
        }
        return $currency . ' ' . number_format($cents / 100, 2, ',', '.');
    }

    /** A short, unique idempotency key for a given operation and reference. */
    public static function idempotencyKey(string $operation, string $reference): string
    {
        return "{$operation}_{$reference}";
    }

    /** Prints a labelled JSON block for readable script output. */
    public static function printResult(string $label, mixed $value): void
    {
        echo PHP_EOL . $label . ':' . PHP_EOL;
        echo json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    }
}
