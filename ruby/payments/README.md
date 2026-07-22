# Payments

Create and reconcile charges across Pix, voucher/boleto and card, plus refunds and cursor
pagination. Each operation is a small `net/http` script.

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

Ruby 3.2+ and a sandbox `PAGOU_API_TOKEN` (see the [Ruby README](../README.md#setup)).
`bundle install` at the `ruby/` root. **Sandbox dependency:** these calls create real sandbox
transactions.

## Run commands

| Command | File | Notes |
| --- | --- | --- |
| `ruby payments/create_pix.rb` | `create_pix.rb` | Create a Pix charge, print the QR payload. |
| `ruby payments/create_voucher.rb` | `create_voucher.rb` | Voucher/boleto with async instructions. |
| `ruby payments/retrieve.rb <id>` | `retrieve.rb` | Retrieve a transaction. |
| `ruby payments/reconcile.rb <id>` | `reconcile.rb` | Reconcile → fulfillment decision. |
| `ruby payments/refund.rb <id> [cents]` | `refund.rb` | Full or partial refund (idempotent). |
| `ruby payments/list.rb` | `list.rb` | Cursor pagination. |
| `ruby payments/card_element/server.rb` | `card_element/server.rb` | Browser card flow (Payment Element). |

## Pix — input and response

`POST /v2/transactions` with `method: "pix"`:

```jsonc
{ "amount": 4900, "method": "pix", "currency": "BRL",
  "buyer": { "name": "Ana Souza", "email": "ana.souza@example.com",
             "document": { "type": "CPF", "number": "19100000000" } },
  "products": [{ "name": "Pro Plan", "price": 4900, "quantity": 1 }],
  "external_ref": "order_1700000000" }
```

The response `data.pix.qr_code` is the copy-and-paste EMV payload; `data.pix.expiration_date` is
when it lapses. `amount` is in the smallest currency unit (cents).

## Voucher / boleto — async instructions

`method: "voucher"`. The instructions (`voucher.barcode`, `voucher.digitable_line`, `voucher.url`)
may arrive **after** creation. When the create response returns `status: "pending"` without them,
reconcile with `GET /v2/transactions/{id}` or wait for the `transaction` webhook.

## Card — Payment Element → `pgct_` → backend → 3DS

Card data never touches your backend. The browser [Payment Element](card_element/) captures the card
and returns a single-use `pgct_*` token; your server sends it as `token` on
`POST /v2/transactions` with `method: "credit_card"`. If the response is `status:
"three_ds_required"`, return `next_action` to the browser so the SDK completes the 3DS challenge:

```json
{ "type": "three_ds_challenge", "challenge_session_id": "3ds_1001",
  "client_secret": "sec_1001", "expires_at": "2026-03-16T14:20:00.000Z" }
```

Fulfill only after a confirmed webhook or server-side reconciliation — never on the browser result.

```bash
ruby payments/card_element/server.rb   # open http://localhost:3000
```

## Refund

`PUT /v2/transactions/{id}/refund`. Omit the amount for a full refund; pass cents for a partial one.
Response: `{ message, amount_refunded, remaining_balance, is_full_refund }`. The example sends an
`Idempotency-Key`, so a retried refund never double-refunds.

## Minimal persistence

Persist the transaction `id` (public UUID) and your `external_ref`. Track the last
`status`; treat `paid`/`captured` as settled and only then fulfill.

## Expected error and recovery

- **`409 DUPLICATE_EXTERNAL_REF`** — the `external_ref` was already used. Reuse the original
  transaction instead of creating a new one (the example catches this).
- **`404`** on retrieve/refund — unknown id.
- **`400`/`422`** — validation; inspect `error.details`.

## Sandbox helper

`ruby payments/sandbox_advance.rb <id> paid` forces a status in sandbox so you can exercise the
paid/refund paths without a real payer. Not available in production.

## Test

`bundle exec rake test` covers status→decision mapping (`reconcile`), pagination query
serialization, refund idempotency headers and error mapping. See [`../tests`](../tests).
