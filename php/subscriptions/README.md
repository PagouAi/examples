# Subscriptions

Create or reuse a customer, then create, retrieve and cancel a subscription. Renewal, failure,
past-due and cancellation are delivered as webhooks (see [../webhooks](../webhooks/README.md)).

- **Guides:** [Create a subscription](https://developer.pagou.ai/subscriptions/create) ·
  [Lifecycle](https://developer.pagou.ai/subscriptions/lifecycle) ·
  [Subscription webhooks](https://developer.pagou.ai/subscriptions/webhooks)
- **OpenAPI:** [Create customer](https://developer.pagou.ai/api-reference/customers/create) ·
  [Create subscription](https://developer.pagou.ai/api-reference/subscriptions/create) ·
  [Retrieve](https://developer.pagou.ai/api-reference/subscriptions/get) ·
  [Cancel](https://developer.pagou.ai/api-reference/subscriptions/cancel)

## Prerequisites

PHP 8.1+, a sandbox `PAGOU_API_TOKEN`, and a `pgct_*` card token from the
[Payment Element](../payments/card-element/) (subscription mode). Provide it as `PAGOU_CARD_TOKEN`.
**Sandbox dependency:** creates a real sandbox customer and subscription.

## Run command

```bash
PAGOU_CARD_TOKEN=pgct_... composer subs:demo   # subscriptions/raw/lifecycle.php
```

Set `PAGOU_CUSTOMER_ID` to reuse an existing customer instead of creating one.

## Flow

1. **Customer** — `POST /v2/customers`. The response `data.id` (UUID) is the public customer id.
2. **Subscription** — `POST /v2/subscriptions`:

   ```jsonc
   { "customer_id": "018f1f2e-...", "payment_method": "credit_card", "token": "pgct_...",
     "interval": "month", "interval_count": 1, "amount": 4900, "currency": "BRL",
     "failure_policy": "retry_then_cancel", "retry_offsets_days": [1, 3, 7],
     "products": [{ "name": "Pro Plan", "price": 4900 }] }
   ```

   Sent with an `Idempotency-Key` so a retry reuses the same subscription. Output fields are
   camelCase (`customerId`, `cancelAtPeriodEnd`).
3. **Retrieve** — `GET /v2/subscriptions/{id}` includes the billed `transactions[]`.
4. **Cancel** — `POST /v2/subscriptions/{id}/cancel` with `reason: "user_requested"`; cancellation
   is scheduled at period end (`cancelAtPeriodEnd: true`).

Status values: `incomplete`, `trialing`, `active`, `past_due`, `cancel_scheduled`, `canceled`.

## Renewal / failure / past-due / cancellation events

These are `subscription` webhooks (`subscription.renewed`, `subscription.payment_failed`,
`subscription.past_due`, `subscription.canceled`). Update business state only on the confirmed event
after reconciling with `GET /v2/subscriptions/{id}` — see the [webhooks flow](../webhooks/README.md).

## Minimal persistence

Store the customer id, subscription id, current `status` and `currentPeriodEnd`. Change entitlement
only on a confirmed webhook.

## Expected error and recovery

- **`404`** on create — the `customer_id` does not exist under this account. Create the customer
  first (the subscription endpoint does not auto-create customers).
- **`400`/`422`** — invalid `token`, interval or amount.

## Test

`composer test` covers the shared client and reconciliation used here. See [`../tests`](../tests).
