<?php

declare(strict_types=1);

namespace Pagou\Examples;

/**
 * Status vocabularies from the Pagou API v2, transcribed from the OpenAPI schema.
 * The examples work with plain associative arrays decoded from JSON; these
 * constants name the statuses the business logic branches on.
 */
final class Types
{
    /** Statuses at which a charge is settled and it is safe to fulfill. */
    public const TERMINAL_PAID_STATUSES = ['paid', 'captured'];

    /** Terminal failure/cancel states: stop waiting, release the order. */
    public const TERMINAL_FAILED_STATUSES = ['canceled', 'expired', 'refused'];

    /** Statuses from which a transfer can typically be cancelled. */
    public const CANCELABLE_TRANSFER_STATUSES = ['pending', 'scheduled'];
}
