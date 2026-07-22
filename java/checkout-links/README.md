# Checkout links

Create a hosted checkout link and store the returned public identifier.

- **Guide:** [Checkout links](https://developer.pagou.ai/payments/checkout-links/create)
- **OpenAPI:** [Create](https://developer.pagou.ai/api-reference/checkout-links/create)

## Prerequisites

Java 17+, Maven 3.9+, and a sandbox `PAGOU_API_TOKEN` (see the [Java README](../README.md#setup)).
**Sandbox dependency:** creates a real sandbox link.

## Run command

```bash
mvn -q compile exec:java@checkout-create   # checkoutlinks/CreateCheckoutLink.java
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

- **`400`/`422`** — missing/invalid product fields; inspect `ApiException.details()`.
- **`401`** — wrong or production token against sandbox.

## Test

Payload shape is validated by the shared client tests; this flow has no server-side reconciliation
step. See [`../src/test`](../src/test).
