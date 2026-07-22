<?php

declare(strict_types=1);

namespace Pagou\Examples\Tests;

use Pagou\Examples\Logger;
use PHPUnit\Framework\TestCase;

final class LoggerTest extends TestCase
{
    public function testMasksSensitiveKeys(): void
    {
        $out = Logger::redact(['Authorization' => 'Bearer abc', 'token' => 'pgct_123', 'amount' => 4900]);
        self::assertSame('[REDACTED]', $out['Authorization']);
        self::assertSame('[REDACTED]', $out['token']);
        self::assertSame(4900, $out['amount']);
    }

    public function testMasksCardTokensAndBearerStringsInsideFreeText(): void
    {
        self::assertSame('charge with [REDACTED]', Logger::redact('charge with pgct_secret123'));
        self::assertSame('header [REDACTED] here', Logger::redact('header Bearer sk_live_xyz here'));
    }

    public function testRedactsNestedStructures(): void
    {
        $out = Logger::redact(['buyer' => ['name' => 'Ana', 'document' => ['number' => '19100000000']]]);
        self::assertSame('Ana', $out['buyer']['name']);
        self::assertSame('[REDACTED]', $out['buyer']['document']['number']);
    }
}
