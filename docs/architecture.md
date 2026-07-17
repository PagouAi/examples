# Architecture

This document describes how the examples are organized and the integration patterns they share across
languages. The goal is structural parity: the same flow looks the same everywhere, only the language
idioms change.

## Principles

- **Reference, not SDK.** Each example uses an idiomatic HTTP client with minimal dependencies. There is
  no shared client library to learn; the value is in the patterns.
- **Contract-driven.** The [OpenAPI snapshot](../shared/contracts/openapi-v2.json) is the source of
  truth for endpoints, methods and fields. The [used-operations manifest](../shared/contracts/used-operations.json)
  records exactly which operations the examples exercise, so a contract check can validate them.
- **Backend-first, browser only where required.** Payments, transfers and subscriptions are created from
  the backend. The browser appears only to capture card data through the Payment Element, which returns
  a `pgct_*` token that the backend then uses.
- **Webhooks are the source of truth.** Async outcomes are confirmed by webhook delivery or by
  server-side reconciliation, never by an optimistic client-side assumption.

## Language directory layout

Every language directory shares the same conceptual structure:

```
<language>/
  README.md      overview + how to run each flow
  .env.example   placeholder configuration (token, base URL)
  payments/      Pix, voucher, card, refund, list
  checkout-links/create + retrieve/store the public identifier
  subscriptions/ customer + subscription lifecycle
  transfers/     Pix Out create, reconcile, cancel
  webhooks/      handlers for the three event families
  tests/         automated tests for the flows above
```

## Fundamentals every example applies

- Environment-based sandbox/production configuration; the API key is server-side only.
- A request/correlation ID propagated and logged.
- Typed and mapped errors rather than raw HTTP failures.
- A request timeout.
- Retries only for transient failures on idempotent operations.
- An idempotency key when the operation supports one (`external_ref` for creates).
- Logging that redacts secrets and PII.

## Flow overview

### Payments

Create a Pix charge and return `pix.qr_code`; retrieve and reconcile a transaction; voucher/boleto with
async instructions; card via Payment Element → `pgct_*` token → backend, continuing 3DS on
`next_action`; full and partial refunds; list transactions with cursor pagination.

### Checkout links

Create a checkout link and store the returned public identifier.

### Customers & subscriptions

Create or reuse a customer; create, retrieve and cancel a subscription; handle renewal, failure,
past-due and cancellation events.

### Transfers (Pix Out)

Create, retrieve and reconcile a transfer; cancel when the status allows; reach the final state via
webhook.

### Webhooks

Real handlers for the three current envelope families:

- **transactions** — envelope `event = transaction` with `data.event_type`.
- **subscriptions** — envelope `event = subscription` with `data.event_type`.
- **transfers** — envelope with `type` and `data.object`.

All handlers respond `2xx` quickly, dedupe by event ID, offload slow work, ignore already-processed
redeliveries, validate authenticity where the public contract supports it, and update business state
only on a confirmed webhook or server-side reconciliation.

## Environments

| Environment | Base URL |
| --- | --- |
| Sandbox | `https://api.sandbox.pagou.ai` |
| Production | `https://api.pagou.ai` |

The same integration code runs against both. Only configuration changes: token, base URL, webhook
target and monitoring.

## Shared assets

- `shared/fixtures/` — synthetic payloads and sample webhook envelopes used by tests.
- `shared/contracts/openapi-v2.json` — the pinned OpenAPI snapshot the examples target.
- `shared/contracts/used-operations.json` — the manifest of operations the examples use.
