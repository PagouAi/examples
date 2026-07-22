# Ruby — Pagou API v2 examples

Runnable, idiomatic Ruby examples for the core flows of the **Pagou API v2**. They mirror the
[TypeScript reference](../typescript/README.md) flow-for-flow so the same integration patterns
translate across languages.

Every flow uses a small, dependency-free client built on the standard library's `net/http`. It shows
exactly what happens on the wire: auth, correlation ids, idempotency keys, timeouts, retries, typed
errors and redacted logging. There is no official Pagou Ruby SDK, so Ruby ships the raw-HTTP variant
only.

> **Sandbox by default.** Every example targets `https://api.sandbox.pagou.ai`. You never need
> production credentials to try this repository. Flows that create money movement (charges,
> transfers, subscriptions) depend on an active sandbox account and a sandbox API token.

## Prerequisites

| Requirement | Minimum | Notes |
| --- | --- | --- |
| Ruby | 3.2 | Uses `net/http` from the standard library. Tested on the current stable (3.3). |
| Bundler | 2.4+ | `gem install bundler` if it is not already present. |
| Sandbox token | — | Create one in your Pagou dashboard (sandbox and production tokens are separate). |

## Setup

```bash
cd ruby
bundle install
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
| [Payments](payments/README.md) | `ruby payments/create_pix.rb` | Pix + QR, voucher/boleto, card (Payment Element → `pgct_` → 3DS), refunds, pagination. |
| [Checkout links](checkout-links/README.md) | `ruby checkout-links/create.rb` | Create a hosted link and store its public URL. |
| [Subscriptions](subscriptions/README.md) | `ruby subscriptions/lifecycle.rb` | Create/reuse customer, create/retrieve/cancel a subscription. |
| [Transfers (Pix Out)](transfers/README.md) | `ruby transfers/lifecycle.rb` | Create, retrieve/reconcile, cancel; final state via webhook. |
| [Webhooks](webhooks/README.md) | `ruby webhooks/server.rb` | The three envelope families, dedupe, fast 2xx, offloaded reconciliation. |

Run scripts from the `ruby/` directory (they load `lib/pagou` and `.env` relative to it). Every flow
directory has its own README with the input payload, the relevant response, the expected error and
recovery path, and links to the matching guide and OpenAPI operation on
[developer.pagou.ai](https://developer.pagou.ai/).

## Layout

```
ruby/
  lib/pagou/        shared client + utilities (config, http_client, errors, logger, reconcile, format)
  payments/         raw net/http scripts + card_element/ (browser Payment Element demo)
  checkout-links/   subscriptions/   transfers/   webhooks/
  tests/            automated tests (minitest)
```

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
- Logs redact `Authorization`, tokens and sensitive payloads (see `lib/pagou/logger.rb`).
- Resources are referenced only by their public UUID `identifier`.

## Tests and coverage

```bash
bundle exec rake test       # run the suite (minitest)
bundle exec rake coverage   # run with a SimpleCov report (writes coverage/)
bundle exec rubocop         # lint
```

Tests exercise the shared logic offline with a stubbed transport: envelope unwrapping, retry and
timeout behavior, idempotency, error mapping, log redaction, reconciliation, and the webhook
parser/dedupe/processor. The runnable scripts are thin CLI wrappers over this tested core.

`coverage.json` in this directory reports each flow's state for the repository
[coverage matrix](../docs/coverage-matrix.md).

## Troubleshooting

See [docs/troubleshooting.md](../docs/troubleshooting.md) and each flow README's "expected error"
section. Common cases: a missing `PAGOU_API_TOKEN` (raised at startup), a `401` (wrong or production
token against sandbox), and a `409 DUPLICATE_EXTERNAL_REF` (reusing an `external_ref`).
