# Python — Pagou API v2 examples

Runnable, idiomatic Python examples for the core flows of the **Pagou API v2**. They mirror the
[TypeScript reference](../typescript/README.md): the same flows, the same integration model, the
same security invariants.

Each flow is built on a small, dependency-light client (`pagou/`) over
[`httpx`](https://www.python-httpx.org/). It shows exactly what happens on the wire: auth,
correlation ids, idempotency keys, timeouts, bounded retries, typed errors and redacted logging. The
webhook and card-element servers use only the Python standard library.

> **Sandbox by default.** Every example targets `https://api.sandbox.pagou.ai`. You never need
> production credentials to try this repository. Flows that create money movement (charges,
> transfers, subscriptions) depend on an active sandbox account and a sandbox API token.

## Prerequisites

| Requirement | Minimum | Notes |
| --- | --- | --- |
| Python | 3.10 | Tested on the current stable (3.14). |
| Dependencies | — | `httpx`, `python-dotenv` (+ `pytest`, `pytest-cov` for tests). |
| Sandbox token | — | Create one in your Pagou dashboard (sandbox and production tokens are separate). |

## Setup

```bash
cd python
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"     # installs the `pagou` package + test tooling
cp .env.example .env        # then set PAGOU_API_TOKEN
```

Installing with `-e` puts the shared `pagou` package on your path, so every flow script runs with a
single `python <flow>/<script>.py` command.

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
| [Payments](payments/README.md) | `python payments/create_pix.py` | Pix + QR, voucher/boleto, card (Payment Element → `pgct_` → 3DS), refunds, pagination. |
| [Checkout links](checkout-links/README.md) | `python checkout-links/create.py` | Create a hosted link and store its public URL. |
| [Subscriptions](subscriptions/README.md) | `python subscriptions/lifecycle.py` | Create/reuse customer, create/retrieve/cancel a subscription. |
| [Transfers (Pix Out)](transfers/README.md) | `python transfers/lifecycle.py` | Create, retrieve/reconcile, cancel; final state via webhook. |
| [Webhooks](webhooks/README.md) | `python webhooks/server.py` | The three envelope families, dedupe, fast 2xx, offloaded reconciliation. |

Every flow directory has its own README with the input payload, the relevant response, the expected
error and recovery path, and links to the matching guide and OpenAPI operation on
[developer.pagou.ai](https://developer.pagou.ai/).

## Layout

```
python/
  pagou/            shared client + utilities (config, http, errors, logger, reconcile, types, format)
  payments/
    card_element/   browser Payment Element demo (static page + tiny stdlib server)
  checkout-links/   subscriptions/   transfers/   webhooks/
  tests/            automated tests (pytest)
```

There is one variant per flow — a raw-HTTP reference. Python has no official Pagou SDK, so unlike
TypeScript there is no `sdk/` variant.

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
- Logs redact `Authorization`, tokens and sensitive payloads (see `pagou/logger.py`).
- Resources are referenced only by their public UUID `identifier`.

## Tests and coverage

```bash
pytest              # run the suite
pytest --cov        # run with a coverage report
```

Tests exercise the shared logic offline with an injected `httpx` transport: envelope unwrapping,
retry and timeout behavior, idempotency, error mapping, log redaction, reconciliation, and the
webhook parser/dedupe/processor. The runnable scripts are thin CLI wrappers over this tested core.

`coverage.json` in this directory reports each flow's state for the repository
[coverage matrix](../docs/coverage-matrix.md).

## Troubleshooting

See [docs/troubleshooting.md](../docs/troubleshooting.md) and each flow README's "expected error"
section. Common cases: a missing `PAGOU_API_TOKEN` (thrown at startup), a `401` (wrong or
production token against sandbox), and a `409 DUPLICATE_EXTERNAL_REF` (reusing an `external_ref`).
