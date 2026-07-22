# C# / .NET — Pagou API v2 examples

Runnable, idiomatic C# examples for the core flows of the **Pagou API v2**. They mirror the
[TypeScript reference](../typescript/README.md) flow-for-flow using only the .NET base class library:
`HttpClient` for transport and `System.Text.Json` for serialization — no third-party runtime
dependencies.

Each flow is a small console project built on a shared client in `src/Pagou.Examples.Core`. That
client shows the fundamentals every language example must demonstrate: server-side auth, correlation
ids, idempotency keys, timeouts, bounded retries for transient failures, typed errors and redacted
logging.

> **Sandbox by default.** Every example targets `https://api.sandbox.pagou.ai`. You never need
> production credentials to try this repository. Flows that create money movement (charges,
> transfers, subscriptions) depend on an active sandbox account and a sandbox API token.

## Prerequisites

| Requirement | Minimum | Notes |
| --- | --- | --- |
| .NET SDK | 8.0 | Targets `net8.0` (LTS). |
| Sandbox token | — | Create one in your Pagou dashboard (sandbox and production tokens are separate). |

## Setup

```bash
cd dotnet
cp .env.example .env   # then set PAGOU_API_TOKEN
dotnet build
```

The examples load a local `.env` automatically (walking up from the working directory). You can also
export the variables in your shell instead of using a file.

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
| [Payments](payments/README.md) | `dotnet run --project payments -- pix` | Pix + QR, voucher/boleto, card (Payment Element → `pgct_` → 3DS), refunds, pagination. |
| [Checkout links](checkout-links/README.md) | `dotnet run --project checkout-links` | Create a hosted link and store its public URL. |
| [Subscriptions](subscriptions/README.md) | `dotnet run --project subscriptions` | Create/reuse customer, create/retrieve/cancel a subscription. |
| [Transfers (Pix Out)](transfers/README.md) | `dotnet run --project transfers` | Create, retrieve/reconcile, cancel; final state via webhook. |
| [Webhooks](webhooks/README.md) | `dotnet run --project webhooks` | The three envelope families, dedupe, fast 2xx, offloaded reconciliation. |

Every flow directory has its own README with the input payload, the relevant response, the expected
error and recovery path, and links to the matching guide and OpenAPI operation on
[developer.pagou.ai](https://developer.pagou.ai/).

## Layout

```
dotnet/
  Pagou.Examples.sln
  src/Pagou.Examples.Core/   shared client + utilities (config, http, errors, logger, reconcile, models, webhooks)
  payments/                  Pix, voucher, card + 3DS, refund, list, sandbox advance
    card-element/            browser Payment Element demo (static page served by the card-server command)
  checkout-links/   subscriptions/   transfers/   webhooks/
  tests/                     automated tests (xUnit) + fixtures
```

Each flow is one console project with a single run command; the payments project accepts a subcommand
(`pix`, `voucher`, `card`, `retrieve`, `reconcile`, `refund`, `list`, `sandbox-advance`, `card-server`).

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
- Logs redact `Authorization`, tokens and sensitive payloads (see `src/Pagou.Examples.Core/Redactor.cs`).
- Resources are referenced only by their public UUID `identifier`.

## Tests and coverage

```bash
dotnet test                                   # run the suite (xUnit)
dotnet test --collect:"XPlat Code Coverage"   # run with a Cobertura coverage report
```

Tests exercise the shared logic offline with an injected `HttpMessageHandler`: envelope unwrapping,
retry and timeout behavior, idempotency, error mapping, log redaction, reconciliation, and the
webhook parser/dedupe/processor. The runnable console projects are thin wrappers over this tested core.

`coverage.json` in this directory reports each flow's state for the repository
[coverage matrix](../docs/coverage-matrix.md).

## Troubleshooting

See [docs/troubleshooting.md](../docs/troubleshooting.md) and each flow README's "expected error"
section. Common cases: a missing `PAGOU_API_TOKEN` (thrown at startup), a `401` (wrong or
production token against sandbox), and a `409 DUPLICATE_EXTERNAL_REF` (reusing an `external_ref`).
