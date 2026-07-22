# PHP — Pagou API v2 examples

Runnable, idiomatic PHP examples for the core flows of the **Pagou API v2**. They mirror the
[TypeScript reference](../typescript/README.md) flow for flow, using a small HTTP client built on
[Guzzle](https://docs.guzzlephp.org/) — the same integration fundamentals, expressed in idiomatic
PHP.

Each flow shows exactly what happens on the wire: server-side auth, correlation ids, idempotency
keys, timeouts, bounded retries for transient failures, typed errors and redacted logging.

> **Sandbox by default.** Every example targets `https://api.sandbox.pagou.ai`. You never need
> production credentials to try this repository. Flows that create money movement (charges,
> transfers, subscriptions) depend on an active sandbox account and a sandbox API token.

## Prerequisites

| Requirement | Minimum | Notes |
| --- | --- | --- |
| PHP | 8.1 | Developed against the current 8.x line (tested through 8.4). |
| Composer | 2.x | Manages the two runtime dependencies. |
| ext-json | — | Bundled with PHP; used for request/response bodies. |
| Sandbox token | — | Create one in your Pagou dashboard (sandbox and production tokens are separate). |

Dependencies are intentionally minimal: [`guzzlehttp/guzzle`](https://packagist.org/packages/guzzlehttp/guzzle)
for HTTP and [`vlucas/phpdotenv`](https://packagist.org/packages/vlucas/phpdotenv) for `.env` loading.

## Setup

```bash
cd php
composer install
cp .env.example .env   # then set PAGOU_API_TOKEN
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PAGOU_API_TOKEN` | yes | Server-side secret token. Never exposed to the browser. |
| `PAGOU_ENVIRONMENT` | no | `sandbox` (default) or `production`. |
| `PAGOU_BASE_URL` | no | Overrides the base URL derived from the environment. |
| `PAGOU_PUBLISHABLE_KEY` | card demo | `pk_test_*` publishable key for the Payment Element (browser-safe). |
| `PAGOU_WEBHOOK_URL` | webhooks | Your public HTTPS endpoint for deliveries. |
| `PAGOU_TIMEOUT_MS` / `PAGOU_MAX_RETRIES` | no | Client tuning (defaults `30000` / `2`). |

## Flows

| Flow | Run command | What it covers |
| --- | --- | --- |
| [Payments](payments/README.md) | `composer pay:pix` | Pix + QR, voucher/boleto, card (Payment Element → `pgct_` → 3DS), refunds, pagination. |
| [Checkout links](checkout-links/README.md) | `composer checkout:create` | Create a hosted link and store its public URL. |
| [Subscriptions](subscriptions/README.md) | `composer subs:demo` | Create/reuse customer, create/retrieve/cancel a subscription. |
| [Transfers (Pix Out)](transfers/README.md) | `composer transfers:demo` | Create, retrieve/reconcile, cancel; final state via webhook. |
| [Webhooks](webhooks/README.md) | `composer webhooks:server` | The three envelope families, dedupe, fast 2xx, offloaded reconciliation. |

Every flow directory has its own README with the input payload, the relevant response, the expected
error and recovery path, and links to the matching guide and OpenAPI operation on
[developer.pagou.ai](https://developer.pagou.ai/).

## Layout

```
php/
  composer.json      dependencies + one run command per flow (composer scripts)
  src/               shared client + utilities (Config, HttpClient, Errors, Logger, Reconcile, Types, Format)
  payments/
    raw/             CLI scripts (Pix, voucher, retrieve, reconcile, refund, list, card)
    card-element/    browser Payment Element demo (static page + tiny PHP server)
  checkout-links/    subscriptions/   transfers/   webhooks/
  tests/             automated tests (PHPUnit)
```

Each flow has a single run command wired as a Composer script, e.g. `composer pay:pix`. Pass extra
arguments after `--`, e.g. `composer pay:retrieve -- <transaction_id>`.

## A note on the SDK variant

The TypeScript reference ships each flow twice — a raw-HTTP variant and an official-SDK variant.
There is no official Pagou PHP SDK, so PHP provides the **raw-HTTP** variant only (recorded as
`"variants": ["raw-http"]` in `coverage.json`). The `src/HttpClient` class is the idiomatic
few-dependency client the brief calls for.

## Authentication

All v2 routes require authentication. The examples send `Authorization: Bearer <token>`. The API
also accepts an `apikey` header or Basic auth (`token` / `x`). Choose one and use it consistently.

## Security invariants

Enforced across the repository and honored here:

- No real keys, tokens, documents, PAN or CVV are committed. `.env.example` holds placeholders only.
- The API key is server-side only and is **never** read in browser code — the Payment Element page
  receives only the publishable `pk_test_*` key.
- Card data is captured solely by the Payment Element and exchanged for a `pgct_*` token. No example
  accepts a PAN or CVV at the backend.
- All fixtures are synthetic.
- Logs redact `Authorization`, tokens and sensitive payloads (see `src/Logger.php`).
- Resources are referenced only by their public UUID `identifier`.

## Tests and coverage

```bash
composer test       # run the suite (PHPUnit)
composer coverage   # run with a coverage report (needs pcov or Xdebug)
```

Tests exercise the shared logic offline with a mocked Guzzle handler: envelope unwrapping, retry and
timeout behavior, idempotency, error mapping, log redaction, reconciliation, and the webhook
parser/dedupe/processor. The runnable scripts are thin CLI wrappers over this tested core.

`coverage.json` in this directory reports each flow's state for the repository
[coverage matrix](../docs/coverage-matrix.md).

## Troubleshooting

See [docs/troubleshooting.md](../docs/troubleshooting.md) and each flow README's "expected error"
section. Common cases: a missing `PAGOU_API_TOKEN` (thrown at startup), a `401` (wrong or
production token against sandbox), and a `409 DUPLICATE_EXTERNAL_REF` (reusing an `external_ref`).
