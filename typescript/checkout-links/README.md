# Checkout links

Create a hosted checkout link and store the returned public identifier.

- **Guide:** [Checkout links](https://developer.pagou.ai/payments/checkout-links/create)
- **OpenAPI:** [Create](https://developer.pagou.ai/api-reference/checkout-links/create)

## Prerequisites

Node 18.18+ and a sandbox `PAGOU_API_TOKEN` (see the [TypeScript README](../README.md#setup)).
**Sandbox dependency:** creates a real sandbox link.

## Run command

```bash
npm run checkout:create   # checkout-links/raw/create.ts
```

## Input and response

`POST /v2/checkout-links`:

```jsonc
{ "title": "Pro Plan", "currency": "BRL",
  "products": [{ "external_id": "pro-plan", "name": "Pro Plan",
                 "price": 4900, "quantity": 1, "type": "digital" }] }
```

The response is `{ "data": { "url": "https://..." } }`. **The `data.url` is the public
identifier** — there is no short code or UUID. Persist that URL; it is the only handle to the link.

## The public surface

The v2 contract exposes **only** `POST /v2/checkout-links`. There is no retrieve or list endpoint,
so store the URL yourself at creation time (marked `not-applicable` in `coverage.json`). Each product
requires `external_id`, `name` and `price` (cents).

## Expected error and recovery

- **`400`/`422`** — missing/invalid product fields; inspect `error.details`.
- **`401`** — wrong or production token against sandbox.

## Test

Payload shape is validated by the shared client tests; this flow has no server-side reconciliation
step. See [`../tests`](../tests).
