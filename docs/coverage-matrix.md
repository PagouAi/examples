# Coverage matrix

This matrix tracks which core flows are implemented in each language. It is the single source of truth
for repository scope, and it links every flow to the matching guide on the official documentation site
(https://developer.pagou.ai/) and to the OpenAPI operations each example exercises.

## States

| State | Icon | Meaning |
| --- | --- | --- |
| `complete` | ✅ | Implemented, tested, and documented to the flow README standard. |
| `partial` | 🟡 | Some sub-steps implemented; not yet the full flow. |
| `planned` | ⬜ | In scope, not yet implemented. |
| `not-applicable` | ➖ | Deliberately out of scope for this language or absent from the public v2 contract. |

## How this file is maintained

Language contributors do **not** edit this file directly (it would cause merge conflicts across
parallel PRs). Each language directory carries a `coverage.json` declaring its per-flow state, and the
docs rollout process consolidates those files into the tables below. The CI `coverage` job runs
`.github/scripts/coverage-report.mjs` to regenerate the flow × language grid from the same
`coverage.json` files and publishes it as a build artifact, so the table here stays verifiable.

## Matrix

Rows are flows; columns are languages. The Docs column links to the matching guide on the official
documentation site; the OpenAPI column links to the reference operations that back the flow.

| Flow | Docs | OpenAPI | TypeScript | Python | PHP | Java | .NET | Go | Ruby |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Payments | [Guide](https://developer.pagou.ai/payments/overview) | [Transactions](https://developer.pagou.ai/api-reference/transactions/reference) | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete |
| Checkout links | [Guide](https://developer.pagou.ai/payments/checkout-links/create) | [Checkout Links](https://developer.pagou.ai/api-reference/checkout-links/reference) | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete |
| Customers & subscriptions | [Guide](https://developer.pagou.ai/subscriptions/overview) | [Subscriptions](https://developer.pagou.ai/api-reference/subscriptions/reference) | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete |
| Transfers (Pix Out) | [Guide](https://developer.pagou.ai/payouts/pix-out/overview) | [Transfers](https://developer.pagou.ai/api-reference/transfers/reference) | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete |
| Webhooks | [Guide](https://developer.pagou.ai/webhooks/overview) | inbound (no operation) | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete | ✅ complete |

Totals — complete: 35, partial: 0, planned: 0, n/a: 0. Every mandatory V1 flow is implemented in all
seven languages.

## Example directories

Each cell above maps to a runnable directory under the matching language. Every flow directory carries
its own `README.md` with the run command, input payload, relevant response, expected error + recovery,
and back-links to the guide and OpenAPI operation.

| Flow | Directory (per language) |
| --- | --- |
| Payments | `<language>/payments/` |
| Checkout links | `<language>/checkout-links/` |
| Customers & subscriptions | `<language>/subscriptions/` |
| Transfers (Pix Out) | `<language>/transfers/` |
| Webhooks | `<language>/webhooks/` |

The consolidated, browsable version of this mapping lives in the **Examples** area of the docs:
https://developer.pagou.ai/examples/overview.

## Operations exercised

The operations below are validated against `shared/contracts/openapi-v2.json` by the contract check.
Every language implements the same set; the TypeScript reference additionally ships an `api-sdk`
variant of Payments, Subscriptions and Transfers alongside the raw-HTTP variant.

| Flow | Operations |
| --- | --- |
| Payments | `postTransactions`, `getTransactions`, `getTransactionsById`, `putTransactionsById`, `putTransactionsByIdRefund` |
| Checkout links | `postCheckoutLinks` (v2 exposes POST only; the returned `data.url` is the public identifier — retrieve/list is `not-applicable`) |
| Customers & subscriptions | `postCustomers`, `getCustomersById`, `postSubscriptions`, `getSubscriptionsById`, `postSubscriptionsByIdCancel` |
| Transfers (Pix Out) | `postTransfers`, `getTransfersById`, `postTransfersByIdCancel` |
| Webhooks | inbound delivery — envelope families `transaction`, `subscription`, `transfer`; no OpenAPI operation |

## Runtime versions

Minimum and current runtime versions per language, consolidated from each `coverage.json`. CI runs the
matrix of versions in `.github/workflows/ci.yml`.

| Language | Minimum runtime | Current runtime | Notes |
| --- | --- | --- | --- |
| TypeScript / Node | 18.18 | 20.x (CI matrix: 20, 24) | Native `fetch` (Node 18+); also runs on Bun and Deno. |
| Python | 3.10 | 3.14 (CI matrix: 3.10, 3.13) | HTTP client on `httpx`; webhook and card-element servers use the standard library only. |
| PHP | 8.1 | 8.4 (CI matrix: 8.1, 8.3) | HTTP client on Guzzle; tested across 8.1–8.4. |
| Java | 17 | 21 (CI matrix: 17, 21) | JDK `java.net.http.HttpClient`; built and tested on Java 21 (LTS). |
| C# / .NET | 8.0 | 8.0 (CI matrix: 8.0.x, 9.0.x) | Targets .NET 8 (LTS); built-in `HttpClient` + `System.Text.Json`, no third-party runtime deps. |
| Go | 1.21 | 1.26 (CI matrix: 1.21, 1.23) | Standard library only (`net/http`, `encoding/json`, `testing`). |
| Ruby | 3.2 | 3.3 (CI matrix: 3.2, 3.3) | Standard library `net/http`; `webrick` backs the two demo servers. |

## Test suites

Each language ships an automated test suite exercised in CI.

| Language | Framework | Test command |
| --- | --- | --- |
| TypeScript / Node | vitest | `npm test` |
| Python | pytest | `pytest` |
| PHP | phpunit | `composer test` |
| Java | junit5 | `mvn test` |
| C# / .NET | xUnit | `dotnet test` |
| Go | go test | `go test ./...` |
| Ruby | minitest | `bundle exec rake test` |

## Webhook envelope families

All languages handle the three current envelope families end to end: dedupe by top-level event id,
respond 2xx fast, offload reconciliation, ignore redelivery, and change business state only on
confirmed events. The public contract exposes no signature; authenticity is established by reconciling
against the API.

| Family | Match | Discriminator |
| --- | --- | --- |
| transactions | `event = "transaction"` | `data.event_type` |
| subscriptions | `event = "subscription"` | `data.event_type` |
| transfers | top-level `type` present + `data.object` | `data.object` |
