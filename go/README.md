# Go — Pagou API v2 examples

Runnable, idiomatic Go examples for the core flows of the **Pagou API v2**. These mirror the
[TypeScript reference](../typescript/README.md) flow for flow.

Every flow uses a single **`raw-http`** variant: a small client built on the standard library
(`net/http`, `encoding/json`) with **no third-party dependencies**. It shows exactly what happens on
the wire — auth, correlation ids, idempotency keys, timeouts, retries, typed errors and redacted
logging.

> **Sandbox by default.** Every example targets `https://api.sandbox.pagou.ai`. You never need
> production credentials to try this repository. Flows that create money movement (charges,
> transfers, subscriptions) depend on an active sandbox account and a sandbox API token.

## Prerequisites

| Requirement | Minimum | Notes |
| --- | --- | --- |
| Go | 1.21 | Standard library only; also builds on the current 1.x toolchain. |
| Sandbox token | — | Create one in your Pagou dashboard (sandbox and production tokens are separate). |

## Setup

```bash
cd go
cp .env.example .env   # then set PAGOU_API_TOKEN
```

The client loads `go/.env` automatically (simple `KEY=VALUE` lines) without overwriting variables
already exported in your shell.

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
| [Payments](payments/README.md) | `go run ./payments/pix` | Pix + QR, voucher/boleto, card (Payment Element → `pgct_` → 3DS), refunds, pagination. |
| [Checkout links](checkout-links/README.md) | `go run ./checkout-links/create` | Create a hosted link and store its public URL. |
| [Subscriptions](subscriptions/README.md) | `go run ./subscriptions/lifecycle` | Create/reuse customer, create/retrieve/cancel a subscription. |
| [Transfers (Pix Out)](transfers/README.md) | `go run ./transfers/lifecycle` | Create, retrieve/reconcile, cancel; final state via webhook. |
| [Webhooks](webhooks/README.md) | `go run ./webhooks/server` | The three envelope families, dedupe, fast 2xx, offloaded reconciliation. |

Every flow directory has its own README with the input payload, the relevant response, the expected
error and recovery path, and links to the matching guide and OpenAPI operation on
[developer.pagou.ai](https://developer.pagou.ai/).

## Layout

```
go/
  internal/pagou/   shared client + utilities (config, http, errors, logger, reconcile, format, types)
  internal/demo/    synthetic demo data + small CLI helpers
  payments/         pix, voucher, retrieve, reconcile, refund, list, card, card-element, sandbox-advance
  checkout-links/   subscriptions/   transfers/   webhooks/
  tests/            automated tests (go test)
```

Each runnable flow is a `main` package under its flow directory; run it with `go run ./<path>`. The
runnable commands are thin CLI wrappers over the tested core in `internal/pagou` and `webhooks`.

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
- Logs redact `Authorization`, tokens and sensitive payloads (see `internal/pagou/logger.go`).
- Resources are referenced only by their public UUID `identifier`.

## Tests and coverage

```bash
go test ./...     # run the suite
go vet ./...      # static checks

# coverage over the shared core exercised by the tests:
go test -coverpkg=./internal/pagou/...,./webhooks/... -coverprofile=coverage.out ./tests/...
go tool cover -func=coverage.out
```

Tests exercise the shared logic offline with a stubbed HTTP transport: envelope unwrapping, retry
and timeout behavior, idempotency, error mapping, log redaction, reconciliation, and the webhook
parser/dedupe/processor.

`coverage.json` in this directory reports each flow's state for the repository
[coverage matrix](../docs/coverage-matrix.md).

## Troubleshooting

See [docs/troubleshooting.md](../docs/troubleshooting.md) and each flow README's "expected error"
section. Common cases: a missing `PAGOU_API_TOKEN` (thrown at startup), a `401` (wrong or production
token against sandbox), and a `409 DUPLICATE_EXTERNAL_REF` (reusing an `external_ref`).
