# Mock server

A zero-dependency Node (ESM) HTTP server that replays the Pagou API v2 contract for the example flows.
It backs the contract tests and lets you run the examples offline without touching the sandbox.

Requires Node >= 18. No `npm install` needed.

## Run

```sh
node shared/mock-server/server.mjs        # listens on http://localhost:4010
PORT=8080 node shared/mock-server/server.mjs
```

Point an example at it with the sandbox base URL override, e.g. `PAGOU_BASE_URL=http://localhost:4010`.
Any non-empty credential is accepted (`Authorization: Bearer …`, `apiKey: …`, or Basic); requests with
no credential get `401`.

## Covered operations

| Flow | Operations |
| --- | --- |
| Transactions | create (pix/voucher/credit_card), retrieve, list (cursor), update, refund, delivery |
| Checkout links | create |
| Customers | create, retrieve, list |
| Subscriptions | create, retrieve, list, update, cancel |
| Transfers | create, retrieve, list, cancel |

Behaviours worth knowing:

- **Idempotency** — a repeated `Idempotency-Key` on `POST /v2/transactions` returns the first response.
- **Duplicate `external_ref`** — a second transaction with the same `external_ref` returns `409
  DUPLICATE_EXTERNAL_REF`.
- **credit_card** — returns `status: three_ds_required` with a `next_action` 3DS challenge.
- **Transfer amount** — the response `amount` is a string, mirroring the contract.
- Responses use the documented envelope `{ success, requestId, data, … }` and pass the OpenAPI response
  schema in the contract test.

## Control plane (non-contract, `/__mock/`)

- `GET /__mock/health`, `GET /health`, `GET /` — liveness/readiness (no auth).
- `POST /__mock/reset` — clears in-memory state.
- `POST /__mock/webhook` — echoes a normalized webhook delivery envelope for handler tests.

## Test

```sh
cd shared/mock-server && node --test test/*.test.mjs
```

The test spins the server up on an ephemeral port and validates every response against the response
schema pulled from `shared/contracts/openapi-v2.json`.
