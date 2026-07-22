<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use Pagou\Examples\Payments\DemoData;
use Pagou\Examples\Reconcile;

// Reconciles a transaction against the API and prints the fulfillment decision.
// This is the safe pattern behind every webhook: trust the API, not the event.
// Run: composer pay:reconcile -- <transaction_id>
try {
    $id = DemoData::resourceIdFromArgs('PAGOU_TRANSACTION_ID');
    $result = Reconcile::transaction($id);

    if ($result === null) {
        fwrite(STDERR, "No transaction {$id}." . PHP_EOL);
        exit(0);
    }

    $tx = $result['transaction'];
    $decision = $result['decision'];
    echo "Transaction {$tx['id']} is {$tx['status']} → decision: {$decision}" . PHP_EOL;
    if ($decision === Reconcile::FULFILL) {
        echo 'Safe to deliver: the charge is settled.' . PHP_EOL;
    } elseif ($decision === Reconcile::WAIT) {
        echo 'Not settled yet: keep the order pending and reconcile again later.' . PHP_EOL;
    } else {
        echo 'Failed/expired: release the order.' . PHP_EOL;
    }
} catch (\Throwable $error) {
    fwrite(STDERR, $error . PHP_EOL);
    exit(1);
}
