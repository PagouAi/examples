# TypeScript / Node — Pagou API v2 examples

Runnable, idiomatic TypeScript examples for the core flows of the **Pagou API v2**. This is the
reference implementation the other languages in this repository mirror.

Every flow ships in two variants so you can compare integration styles:

- **`raw-http`** — a small, dependency-free client built on the native `fetch` (Node 18+). It shows
  exactly what happens on the wire: auth, correlation ids, idempotency keys, timeouts, retries,
  typed errors and redacted logging.
- **`api-sdk`** — the same flow using the official [`@pagouai/api-sdk`](https://www.npmjs.com/package/@pagouai/api-sdk).

> **Sandbox by default.** Every example targets `https://api.sandbox.pagou.ai`. You never need
> production credentials to try this repository. Flows that create money movement (charges,
> transfers, subscriptions) depend on an active sandbox account and a sandbox API token.

## Prerequisites

| Requirement | Minimum | Notes |
| --- | --- | --- |
| Node.js | 18.18 | Uses the global `fetch`. Also runs on Bun and Deno. |
| Package manager | npm 9+ | `pnpm` / `yarn` work equally well. |
| Sandbox token | — | Create one in your Pagou dashboard (sandbox and production tokens are separate). |

## Setup

```bash
cd typescript
npm install
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
| [Payments](payments/README.md) | `npm run pay:pix` | Pix + QR, voucher/boleto, card (Payment Element → `pgct_` → 3DS), refunds, pagination. |
| [Checkout links](checkout-links/README.md) | `npm run checkout:create` | Create a hosted link and store its public URL. |
| [Subscriptions](subscriptions/README.md) | `npm run subs:demo` | Create/reuse customer, create/retrieve/cancel a subscription. |
| [Transfers (Pix Out)](transfers/README.md) | `npm run transfers:demo` | Create, retrieve/reconcile, cancel; final state via webhook. |
| [Webhooks](webhooks/README.md) | `npm run webhooks:server` | The three envelope families, dedupe, fast 2xx, offloaded reconciliation. |

Every flow directory has its own README with the input payload, the relevant response, the expected
error and recovery path, and links to the matching guide and OpenAPI operation on
[developer.pagou.ai](https://developer.pagou.ai/).

## How the two variants are laid out

```
typescript/
  src/lib/          shared client + utilities (config, http, sdk, errors, logger, reconcile, types)
  payments/
    raw/            fetch-based scripts
    sdk/            @pagouai/api-sdk scripts
    card-element/   browser Payment Element demo (static page + tiny server)
  checkout-links/   subscriptions/   transfers/   webhooks/
  tests/            automated tests (vitest)
```

A single run command per flow is wired in `package.json`. The `:sdk` suffix runs the SDK variant,
e.g. `npm run pay:pix` (raw) vs `npm run pay:pix:sdk`.

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
- Logs redact `Authorization`, tokens and sensitive payloads (see `src/lib/logger.ts`).
- Resources are referenced only by their public UUID `identifier`.

## Tests and coverage

```bash
npm test          # run the suite (vitest)
npm run coverage  # run with a coverage report
npm run typecheck # tsc --noEmit
```

Tests exercise the shared logic offline with an injected `fetch`: envelope unwrapping, retry and
timeout behavior, idempotency, error mapping, log redaction, reconciliation, and the webhook
parser/dedupe/processor. The runnable scripts are thin CLI wrappers over this tested core.

`coverage.json` in this directory reports each flow's state for the repository
[coverage matrix](../docs/coverage-matrix.md).

## Troubleshooting

See [docs/troubleshooting.md](../docs/troubleshooting.md) and each flow README's "expected error"
section. Common cases: a missing `PAGOU_API_TOKEN` (thrown at startup), a `401` (wrong or
production token against sandbox), and a `409 DUPLICATE_EXTERNAL_REF` (reusing an `external_ref`).
