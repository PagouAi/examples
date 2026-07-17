# Java — Pagou API v2 examples

> **Status: planned.** This directory is scaffolded; flows are not implemented yet. Track progress in
> the [coverage matrix](../docs/coverage-matrix.md).

Idiomatic Java examples using a minimal HTTP client with few dependencies.

## Structure

```
java/
  .env.example
  payments/         Pix, voucher, card, refund, list
  checkout-links/   create + store the public identifier
  subscriptions/    customer + subscription lifecycle
  transfers/        Pix Out create, reconcile, cancel
  webhooks/         handlers for the three event families
  tests/            automated tests
```

## Setup

1. Copy the environment file and set your sandbox token:

   ```bash
   cp .env.example .env
   ```

2. Each flow directory documents its own install and single run command in the flow README (added as
   flows land).

See the [root README](../README.md) and [architecture](../docs/architecture.md) for the shared
integration model and security invariants.
