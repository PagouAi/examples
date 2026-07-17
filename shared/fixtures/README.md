# Fixtures

Synthetic payloads shared by the examples, their tests and the [mock server](../mock-server/).

Everything here is **fabricated** — no real credentials, customers, documents or card data. Amounts are
in the smallest currency unit (cents for `BRL`). Identifiers are random UUIDs. Card flows reference only
tokenized values (`pgct_*` / `SYNTHETIC_*`), never PAN/CVV.

Use these fixtures for contract tests and for driving the mock server. Do not add real data.

## Layout

`index.json` lists every fixture grouped by flow. Each response fixture mirrors the envelope documented
in the OpenAPI v2 contract (`{ success, requestId, data }`, or a webhook delivery envelope).

### Payments
- `transaction.pix.json` — Pix create response with `pix.qr_code`.
- `transaction.voucher.json` — voucher/boleto create response with async instructions.
- `transaction.credit_card.json` — card create response with `next_action` (3DS challenge).
- `transaction.refunded.json` — a partially refunded transaction.
- `transaction.list.json` — cursor-paginated transaction list.

### Checkout links
- `checkout-link.json` — create response with the public checkout `url`.

### Customers & subscriptions
- `customer.json` / `customer.list.json` — customer create and list responses.
- `subscription.json` — an active subscription.
- `subscription.canceled.json` — a canceled subscription.

### Transfers (Pix Out)
- `transfer.json` — create response (status `pending`).
- `transfer.settled.json` — a settled transfer (status `paid`).
- `transfer.list.json` — transfer list response.

### Webhooks
- `webhook.transaction.json` — envelope `event=transaction` + `data.event_type`.
- `webhook.subscription.json` — envelope `event=subscription` + `data.event_type`.
- `webhook.transfer.json` — payout envelope with top-level `type` + `data.object`.
