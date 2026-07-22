# Payments

Create and reconcile charges across Pix, voucher/boleto and card, plus refunds and cursor
pagination. Every operation is a `raw-http` reference built on `java.net.http.HttpClient`.

- **Guides:** [Accept Pix](https://developer.pagou.ai/payments/pix/accept-payments) ·
  [Vouchers](https://developer.pagou.ai/payments/vouchers/accept-payments) ·
  [Cards](https://developer.pagou.ai/payments/cards/overview) ·
  [Payment Element](https://developer.pagou.ai/frontend/payment-element/quickstart) ·
  [Transaction statuses](https://developer.pagou.ai/payments/transaction-statuses)
- **OpenAPI:** [Create](https://developer.pagou.ai/api-reference/transactions/create) ·
  [Retrieve](https://developer.pagou.ai/api-reference/transactions/get) ·
  [List](https://developer.pagou.ai/api-reference/transactions/list) ·
  [Refund](https://developer.pagou.ai/api-reference/transactions/refund)

## Prerequisites

Java 17+, Maven 3.9+, and a sandbox `PAGOU_API_TOKEN` (see the [Java README](../README.md#setup)).
**Sandbox dependency:** these calls create real sandbox transactions.

## Run commands

| Command | Class | Notes |
| --- | --- | --- |
| `mvn -q compile exec:java@pay-pix` | `payments/CreatePix.java` | Create a Pix charge, print the QR payload. |
| `mvn -q compile exec:java@pay-voucher` | `payments/CreateVoucher.java` | Voucher/boleto with async instructions. |
| `mvn -q compile exec:java@pay-retrieve -Dexec.args="<id>"` | `payments/Retrieve.java` | Retrieve a transaction. |
| `mvn -q compile exec:java@pay-reconcile -Dexec.args="<id>"` | `payments/ReconcileCli.java` | Reconcile → fulfillment decision. |
| `mvn -q compile exec:java@pay-refund -Dexec.args="<id> [cents]"` | `payments/Refund.java` | Full or partial refund (idempotent). |
| `mvn -q compile exec:java@pay-list` | `payments/ListTransactions.java` | Cursor pagination. |
| `mvn -q compile exec:java@pay-card-server` | `payments/CardElementServer.java` | Browser card flow (Payment Element). |

## Pix — input and response

`POST /v2/transactions` with `method: "pix"`:

```jsonc
{ "amount": 4900, "method": "pix", "currency": "BRL",
  "buyer": { "name": "Ana Souza", "email": "ana.souza@example.com",
             "document": { "type": "CPF", "number": "19100000000" } },
  "products": [{ "name": "Pro Plan", "price": 4900, "quantity": 1 }],
  "external_ref": "order_1700000000000" }
```

The response `data.pix.qr_code` is the copy-and-paste EMV payload; `data.pix.expiration_date` is
when it lapses. `amount` is in the smallest currency unit (cents).

## Voucher / boleto — async instructions

`method: "voucher"`. The instructions (`voucher.barcode`, `voucher.digitable_line`, `voucher.url`)
may arrive **after** creation. When the create response returns `status: "pending"` without them,
reconcile with `GET /v2/transactions/{id}` or wait for the `transaction` webhook.

## Card — Payment Element → `pgct_` → backend → 3DS

Card data never touches your backend. The browser [Payment Element](../src/main/resources/card-element/index.html)
captures the card and returns a single-use `pgct_*` token; your server sends it as `token` on
`POST /v2/transactions` with `method: "credit_card"`. If the response is `status:
"three_ds_required"`, return `next_action` to the browser so the SDK completes the 3DS challenge:

```json
{ "type": "three_ds_challenge", "challenge_session_id": "3ds_1001",
  "client_secret": "sec_1001", "expires_at": "2026-03-16T14:20:00.000Z" }
```

Fulfill only after a confirmed webhook or server-side reconciliation — never on the browser result.

```bash
mvn -q compile exec:java@pay-card-server   # open http://localhost:3000
```

The backend half can also run from the CLI with a token you already hold:

```bash
PAGOU_CARD_TOKEN=pgct_... mvn -q compile exec:java@pay-card
```

## Refund

`PUT /v2/transactions/{id}/refund`. Omit `amount` for a full refund; pass cents for a partial one.
Response: `{ message, amount_refunded, remaining_balance, is_full_refund }`. The example sends an
`Idempotency-Key`, so a retried refund never double-refunds.

## Minimal persistence

Persist the transaction `id` (public UUID) and your `external_ref`. Track the last
`status`; treat `paid`/`captured` as settled and only then fulfill.

## Expected error and recovery

- **`409 DUPLICATE_EXTERNAL_REF`** — the `external_ref` was already used. Reuse the original
  transaction instead of creating a new one (the example catches this).
- **`404`** on retrieve/refund — unknown id.
- **`400`/`422`** — validation; inspect `ApiException.details()`.

## Sandbox helper

`mvn -q compile exec:java@pay-sandbox-advance -Dexec.args="<id> paid"` forces a status in sandbox so
you can exercise the paid/refund paths without a real payer. Not available in production.

## Test

`mvn test` covers status→decision mapping (`ReconcileTest`), pagination query serialization, refund
idempotency headers and error mapping (`PagouHttpClientTest`). See [`../src/test`](../src/test).
