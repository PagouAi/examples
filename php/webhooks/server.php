<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use Pagou\Examples\Logger;
use Pagou\Examples\Webhooks\Handlers;
use Pagou\Examples\Webhooks\Processor;
use Pagou\Examples\Webhooks\Store;

// Webhook receiver for the three event families. It follows the rules every
// handler must: parse the envelope, require the event id, dedupe redeliveries,
// answer 2xx immediately, and offload the slow reconciliation. Business state is
// updated only inside the offloaded processor, only on confirmed events.
// Run: composer webhooks:server   (POST envelopes to http://localhost:4000/webhooks/pagou)

/** Sends a JSON response and flushes it so the ack goes out before slow work. */
function reply(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($body);
    // Return the ack to the caller before running the reconciliation. Under
    // php-fpm this uses fastcgi_finish_request; a production app would instead
    // enqueue the event to a worker queue and let that do the reconcile.
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        flush();
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if ($method !== 'POST' || $path !== '/webhooks/pagou') {
    reply(404, ['error' => 'not_found']);
    return;
}

$parsedBody = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($parsedBody)) {
    reply(400, ['error' => 'invalid_json']);
    return;
}

$event = Handlers::parse($parsedBody);
if (is_array($event)) {
    // Documented ingestion error for a missing event id.
    reply($event['error'] === 'missing_event_id' ? 400 : 422, ['error' => $event['error']]);
    return;
}

// Dedupe synchronously: a redelivery is acknowledged without reprocessing.
if (!Store::markProcessed($event->id)) {
    Logger::info("Duplicate delivery ignored: {$event->id} ({$event->eventType})");
    reply(200, ['received' => true]);
    return;
}

// Ack fast (fulfilling the "respond 2xx quickly" rule), then offload the
// reconciliation so a slow API call never delays the response or risks a retry.
reply(200, ['received' => true]);

try {
    Processor::process($event);
} catch (\Throwable $error) {
    Logger::error("Deferred processing failed for {$event->id}", ['message' => $error->getMessage()]);
}
