# Transfers (Pix Out)

Create a Pix Out transfer, retrieve/reconcile it, and cancel it while the status allows. The final
state (`paid` / `rejected`) arrives via the transfer webhook family.

- **Guides:** [Pix Out overview](https://developer.pagou.ai/payouts/pix-out/overview) ·
  [Create](https://developer.pagou.ai/payouts/pix-out/create-transfer) ·
  [Cancel](https://developer.pagou.ai/payouts/pix-out/cancel-transfer) ·
  [Statuses](https://developer.pagou.ai/payouts/pix-out/statuses)
- **OpenAPI:** [Create](https://developer.pagou.ai/api-reference/transfers/create) ·
  [Retrieve](https://developer.pagou.ai/api-reference/transfers/get) ·
  [Cancel](https://developer.pagou.ai/api-reference/transfers/cancel)

## Prerequisites

Ruby 3.2+ and a sandbox `PAGOU_API_TOKEN` (see the [Ruby README](../README.md#setup)).
**Sandbox dependency:** creates a real sandbox transfer.

## Run command

```bash
ruby transfers/lifecycle.rb
```

## Flow

1. **Create** — `POST /v2/transfers`:

   ```jsonc
   { "pix_key_type": "EMAIL", "pix_key_value": "supplier@example.com",
     "amount": 5000, "description": "Supplier payout", "external_ref": "payout_1700000000" }
   ```

   `amount` is numeric cents on input (minimum `1000`). Sent with an `Idempotency-Key`.
   Key types: `CPF`, `CNPJ`, `EMAIL`, `PHONE`, `EVP`.
2. **Retrieve / reconcile** — `GET /v2/transfers/{id}`. Note `amount` comes back as a **decimal
   string** on responses (numeric cents on list items).
3. **Cancel** — `POST /v2/transfers/{id}/cancel` with a free-text `reason`, only from a cancelable
   status (`pending`, `scheduled`).

Status values: `pending`, `scheduled`, `in_analysis`, `processing`, `paid`, `rejected`,
`cancelled`, `error`, `unknown`.

## Final state via webhook

Once processing, the transfer settles asynchronously. Reconcile with `GET` or handle the
`payout.transferred` / `payout.failed` / `payout.rejected` events in the
[webhooks flow](../webhooks/README.md).

## Minimal persistence

Store the transfer id, `external_ref`, and current `status`. Consider funds moved only on
`paid` / `payout.transferred`.

## Expected error and recovery

- **`409`** on cancel — "The transfer cannot be cancelled in its current state." It already
  progressed past a cancelable status; reconcile via `GET`/webhook (the example catches this).
- **`400`/`422`** — invalid Pix key or an amount below the minimum.

## Test

`bundle exec rake test` covers the shared client (retry, idempotency, error mapping). See
[`../tests`](../tests).
