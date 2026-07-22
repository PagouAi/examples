# Payments

Create and reconcile charges across Pix, voucher/boleto and card, plus refunds and cursor
pagination. Each operation is a small `main` command under `payments/`.

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

Go 1.21+ and a sandbox `PAGOU_API_TOKEN` (see the [Go README](../README.md#setup)).
**Sandbox dependency:** these calls create real sandbox transactions.

## Run commands

| Command | Package | Notes |
| --- | --- | --- |
| `go run ./payments/pix` | `pix` | Create a Pix charge, print the QR payload. |
| `go run ./payments/voucher` | `voucher` | Voucher/boleto with async instructions. |
| `go run ./payments/retrieve <id>` | `retrieve` | Retrieve a transaction. |
| `go run ./payments/reconcile <id>` | `reconcile` | Reconcile → fulfillment decision. |
| `go run ./payments/refund <id> [cents]` | `refund` | Full or partial refund (idempotent). |
| `go run ./payments/list` | `list` | Cursor pagination. |
| `go run ./payments/card` | `card` | Charge a `pgct_` token (backend half of the card flow). |
| `go run ./payments/card-element` | `card-element` | Browser card flow (Payment Element). |

Commands that take an id also accept `PAGOU_TRANSACTION_ID` instead of the positional argument.

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

Card data never touches your backend. The browser [Payment Element](card-element/) captures the card
and returns a single-use `pgct_*` token; your server sends it as `token` on `POST /v2/transactions`
with `method: "credit_card"`. If the response is `status: "three_ds_required"`, return `next_action`
to the browser so the SDK completes the 3DS challenge:

```json
{ "type": "three_ds_challenge", "challenge_session_id": "3ds_1001",
  "client_secret": "sec_1001", "expires_at": "2026-03-16T14:20:00.000Z" }
```

Fulfill only after a confirmed webhook or server-side reconciliation — never on the browser result.

```bash
go run ./payments/card-element   # open http://localhost:3000
```

The backend-only `go run ./payments/card` charges an existing `pgct_` token (pass it as arg 1 or
`PAGOU_CARD_TOKEN`) so you can exercise the server half from the CLI.

## Refund

`PUT /v2/transactions/{id}/refund`. Omit the amount for a full refund; pass cents for a partial one.
Response: `{ message, amount_refunded, remaining_balance, is_full_refund }`. The example sends an
`Idempotency-Key`, so a retried refund never double-refunds.

## Minimal persistence

Persist the transaction `id` (public UUID) and your `external_ref`. Track the last `status`; treat
`paid`/`captured` as settled and only then fulfill.

## Expected error and recovery

- **`409 DUPLICATE_EXTERNAL_REF`** — the `external_ref` was already used. Reuse the original
  transaction instead of creating a new one (the example catches this).
- **`404`** on retrieve/refund — unknown id.
- **`400`/`422`** — validation; inspect the error details.

## Sandbox helper

`go run ./payments/sandbox-advance <id> paid` forces a status in sandbox so you can exercise the
paid/refund paths without a real payer. Not available in production.

## Test

`go test ./...` covers status→decision mapping (`reconcile`), pagination query serialization, refund
idempotency headers and error mapping. See [`../tests`](../tests).
