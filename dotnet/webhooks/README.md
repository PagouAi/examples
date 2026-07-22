# Webhooks

A real receiver for the three current envelope families. It applies every rule a production handler
needs: parse the envelope, require the event id, dedupe redeliveries, answer `2xx` fast, offload the
slow work, and change business state only on a confirmed event after reconciling against the API.

- **Guides:** [Webhooks overview](https://developer.pagou.ai/webhooks/overview) ·
  [Payment events](https://developer.pagou.ai/webhooks/payment-events) ·
  [Transfer events](https://developer.pagou.ai/webhooks/transfer-events) ·
  [Retries & reconciliation](https://developer.pagou.ai/webhooks/retries-and-reconciliation) ·
  [Subscription events](https://developer.pagou.ai/subscriptions/webhooks)

## Prerequisites

.NET SDK 8.0+ and a sandbox `PAGOU_API_TOKEN` (reconciliation calls the API). Configure
`PAGOU_WEBHOOK_URL` in your dashboard to point at this receiver's public URL.
**Sandbox dependency:** reconciliation reads live sandbox resources.

## Run command

```bash
dotnet run --project webhooks   # POST envelopes to http://localhost:4000/webhooks/pagou
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
  "missing_event_id" }` (`WebhookParser` → `Program.cs`).
- **Dedupe redelivery** — `WebhookStore.MarkProcessed(id)` returns `true` once; any redelivery is
  acknowledged `200 { "received": true }` without reprocessing.
- **Respond 2xx fast** — the ack is sent before any API call; the reconciliation runs on a
  background task (`Program.cs`).
- **Offload slow work** — `WebhookProcessor.ProcessEventAsync` does the reconciliation off the
  response path.
- **State change only on confirmed** — `WebhookParser.IsConfirmedStateChange` gates which events
  trigger a reconcile; informational events (`transaction.created`, `subscription.trial_will_end`)
  never change state.
- **Authenticity** — the public contract exposes **no signature header**. Authenticity is
  established by reconciling against the API (`GET /v2/{resource}/{id}`) — the webhook is a hint,
  the API is the source of truth. Do not fulfill from the event body alone.

## Minimal persistence

Two stores (in-memory here): processed event ids for idempotency, and the reconciled resource state
you actually fulfill against. Back both with a database in production.

## Expected error and recovery

- **`400 missing_event_id`** — the envelope had no `id`; the sender should include it.
- **Reconciliation failure after the ack** — logged; a production system requeues the event for a
  later retry rather than replaying side effects.

## Test

`dotnet test` covers envelope routing for all three families, the missing-id rejection, dedupe, the
confirmed-vs-informational gate, and that `ProcessEventAsync` reconciles and updates state only on a
confirmed event. See [`../tests/WebhooksTests.cs`](../tests/WebhooksTests.cs).
