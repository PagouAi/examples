# Java — Pagou API v2 examples

Runnable, idiomatic Java examples for the core flows of the **Pagou API v2**. They mirror the
[TypeScript reference](../typescript/README.md) flow-for-flow, built on the JDK's
`java.net.http.HttpClient` with a single JSON dependency (Jackson) and no third-party HTTP library.

Each flow ships as a small `raw-http` reference: it shows exactly what happens on the wire — auth,
correlation ids, idempotency keys, timeouts, bounded retries, typed errors and redacted logging.
There is no official Pagou Java SDK, so (unlike TypeScript) there is no `api-sdk` variant.

> **Sandbox by default.** Every example targets `https://api.sandbox.pagou.ai`. You never need
> production credentials to try this repository. Flows that create money movement (charges,
> transfers, subscriptions) depend on an active sandbox account and a sandbox API token.

## Prerequisites

| Requirement | Minimum | Notes |
| --- | --- | --- |
| JDK | 17 | Uses `java.net.http.HttpClient` and records. Built/tested on Java 21 (LTS). |
| Maven | 3.9+ | Wraps the build, tests and per-flow run commands. |
| Sandbox token | — | Create one in your Pagou dashboard (sandbox and production tokens are separate). |

## Setup

```bash
cd java
cp .env.example .env   # then set PAGOU_API_TOKEN
mvn -q compile
```

The examples read a local `.env` (or process environment variables) at startup — no dotenv
dependency. Run the commands from the `java/` directory so `.env` is found.

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
| [Payments](payments/README.md) | `mvn -q compile exec:java@pay-pix` | Pix + QR, voucher/boleto, card (Payment Element → `pgct_` → 3DS), refunds, pagination. |
| [Checkout links](checkout-links/README.md) | `mvn -q compile exec:java@checkout-create` | Create a hosted link and store its public URL. |
| [Subscriptions](subscriptions/README.md) | `mvn -q compile exec:java@subs-demo` | Create/reuse customer, create/retrieve/cancel a subscription. |
| [Transfers (Pix Out)](transfers/README.md) | `mvn -q compile exec:java@transfers-demo` | Create, retrieve/reconcile, cancel; final state via webhook. |
| [Webhooks](webhooks/README.md) | `mvn -q compile exec:java@webhooks-server` | The three envelope families, dedupe, fast 2xx, offloaded reconciliation. |

Every flow directory has its own README with the input payload, the relevant response, the expected
error and recovery path, and links to the matching guide and OpenAPI operation on
[developer.pagou.ai](https://developer.pagou.ai/).

## How the code is laid out

```
java/
  pom.xml                       one module; a named exec execution per flow
  payments/  checkout-links/  subscriptions/  transfers/  webhooks/   per-flow READMEs
  src/main/java/ai/pagou/examples/
    lib/                        shared client + utilities (Config, PagouHttpClient, Errors,
                                Logger, Redactor, Models, Reconcile, Format, Json, Request)
    payments/                   CreatePix, CreateVoucher, CreateCard, Retrieve, ReconcileCli,
                                Refund, ListTransactions, SandboxAdvance, CardElementServer
    checkoutlinks/  subscriptions/  transfers/  webhooks/
  src/main/resources/card-element/index.html   browser Payment Element demo
  src/test/java/ai/pagou/examples/             automated tests (JUnit 5)
  src/test/resources/fixtures/                 synthetic webhook envelopes
```

A single run command per flow is wired as a named `exec-maven-plugin` execution (e.g.
`exec:java@pay-pix`), mirroring the npm scripts in the TypeScript reference. Pass CLI arguments with
`-Dexec.args="..."`.

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
- Logs redact `Authorization`, tokens and sensitive payloads (see `lib/Redactor.java`).
- Resources are referenced only by their public UUID `identifier`.

## Tests and coverage

```bash
mvn test          # run the JUnit suite (also builds)
```

The suite runs offline with an injected HTTP exchange (`PagouHttpClient.Exchange`): envelope
unwrapping, retry and timeout behavior, idempotency, error mapping, log redaction, reconciliation,
and the webhook parser/dedupe/processor. The runnable classes are thin CLI wrappers over this tested
core. A JaCoCo coverage report is written to `target/site/jacoco/index.html` on every `mvn test`.

`coverage.json` in this directory reports each flow's state for the repository
[coverage matrix](../docs/coverage-matrix.md).

## Troubleshooting

See [docs/troubleshooting.md](../docs/troubleshooting.md) and each flow README's "expected error"
section. Common cases: a missing `PAGOU_API_TOKEN` (thrown at startup), a `401` (wrong or
production token against sandbox), and a `409 DUPLICATE_EXTERNAL_REF` (reusing an `external_ref`).
