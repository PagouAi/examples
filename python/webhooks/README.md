# Webhooks

A real receiver for the three current envelope families. It applies every rule a production handler
needs: parse the envelope, require the event id, dedupe redeliveries, answer `2xx` fast, offload the
slow work, and change business state only on a confirmed event after reconciling against the API.
The receiver uses only the Python standard library (`http.server`).

- **Guides:** [Webhooks overview](https://developer.pagou.ai/webhooks/overview) ·
  [Payment events](https://developer.pagou.ai/webhooks/payment-events) ·
  [Transfer events](https://developer.pagou.ai/webhooks/transfer-events) ·
  [Retries & reconciliation](https://developer.pagou.ai/webhooks/retries-and-reconciliation) ·
  [Subscription events](https://developer.pagou.ai/subscriptions/webhooks)

## Prerequisites

Python 3.10+ and a sandbox `PAGOU_API_TOKEN` (reconciliation calls the API). Configure
`PAGOU_WEBHOOK_URL` in your dashboard to point at this receiver's public URL.
**Sandbox dependency:** reconciliation reads live sandbox resources.

## Run command

```bash
python webhooks/server.py   # POST envelopes to http://localhost:4000/webhooks/pagou
```

Try it with a fixture:

```bash
curl -sS -X POST http://localhost:4000/webhooks/pagou \
  -H 'Content-Type: application/json' \
  --data @tests/fixtures/webhook.transaction.json
```

## The three envelope families

| Family | Discriminator | Event name | Resource id |
| --- | --- | --- | --- |
| Transactions | `event: "transaction"` | `data.event_type` | `data.id` |
| Subscriptions | `event: "subscription"` | `data.event_type` | `data.id` |
| Transfers | top-level `type` | `type` | `data.object.id` |

All three carry a top-level `id` — **the dedupe key**. A resource emits many events over its life,
so deduping by resource id would drop distinct events.

## The rules, and where each lives

- **Require the event id** — a body without a top-level `id` is answered `400 { "error":
  "missing_event_id" }` (`handlers.py` → `server.py`).
- **Dedupe redelivery** — `store.mark_processed(id)` returns `True` once; any redelivery is
  acknowledged `200 { "received": true }` without reprocessing.
- **Respond 2xx fast** — the ack is sent before any API call; the reconciliation runs on a
  background thread (`server.py`).
- **Offload slow work** — `processor.process_event` does the reconciliation off the response path.
- **State change only on confirmed** — `handlers.is_confirmed_state_change` gates which events
  trigger a reconcile; informational events (`transaction.created`, `subscription.trial_will_end`)
  never change state.
- **Signature** — a webhook endpoint with a non-empty `secret_token` is delivered with
  `X-Pagou-Timestamp` and `X-Pagou-Signature`. An empty secret omits those headers. `notify_url`
  postbacks without `secret_token` stay unsigned. Details are in [Outbound signature](#outbound-signature).
- **Reconcile** — fulfill only after `GET /v2/{resource}/{id}`. The signature authenticates the
  delivery; the API response is the source of truth for the resource.

## Outbound signature

Pagou signs a registered webhook endpoint only when its `secret_token` is a non-empty string.

| Header | Value |
| --- | --- |
| `X-Pagou-Timestamp` | Unix time in seconds, as a decimal string. |
| `X-Pagou-Signature` | `sha256=` followed by the lowercase hex HMAC-SHA256 digest. |
| `Content-Type` | `application/json` on every delivery. |
| `User-Agent` | `Pagou.ai - Webhook Service` on every delivery. |

The MAC input is the UTF-8 string `` `${timestamp}.${rawBody}` `` and the key is `secret_token`.
`rawBody` is the exact HTTP body. When the sender holds an object it signs `JSON.stringify(object)`.
A body that is already a string is signed as that string. Verify those bytes before parsing JSON.

Compare with a timing-safe equality on equal-length buffers. Reject a timestamp more than 5 minutes
from your clock in either direction. The sender does not enforce that window.

An empty, null, or omitted `secret_token` means the two `X-Pagou-*` headers are absent. A
per-transaction or per-transfer `notify_url`, and any other postback queued without `secret_token`,
stays unsigned.

Set `secret_token` in the dashboard webhook configuration, or through the webhook API when you
create or update the endpoint. Outbound `X-Pagou-*` headers are added by the delivery service.
They are not request operations in [`shared/contracts/openapi-v2.json`](../../shared/contracts/openapi-v2.json).

**Warning:** do not implement the scheme published at [docs.pagou.com.br](https://docs.pagou.com.br).
That site documents a different product: timestamp and payload concatenated with no `.`, no `sha256=`
prefix, and the API key as the HMAC secret.

Apply this check on the raw body before trusting the envelope. The TypeScript receiver
([`verify.ts`](../../typescript/webhooks/verify.ts)) does that when `PAGOU_WEBHOOK_SECRET` is set.

## Minimal persistence

Two tables (in-memory here): processed event ids for idempotency, and the reconciled resource state
you actually fulfill against. Back both with a database in production.

## Expected error and recovery

- **`400 missing_event_id`** — the envelope had no `id`; the sender should include it.
- **Reconciliation failure after the ack** — logged; a production system requeues the event for a
  later retry rather than replaying side effects.

## Test

`pytest` covers envelope routing for all three families, the missing-id rejection, dedupe, the
confirmed-vs-informational gate, and that `process_event` reconciles and updates state only on a
confirmed event. See [`../tests/test_webhooks.py`](../tests/test_webhooks.py).
