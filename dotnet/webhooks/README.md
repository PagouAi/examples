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
`PAGOU_WEBHOOK_URL` under **Settings → Integrations** so it points at this receiver's public URL.
To sign those POSTs, set a **Security Token** on the webhook (create or edit). Leave the field
blank to generate one automatically (“Leave blank to generate automatically.”), then store the
value in `PAGOU_SECURITY_TOKEN`.

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
- **Signature** — when the webhook subscription has a **Security Token**, verify `X-Pagou-Signature`
  on the exact HTTP body before parsing JSON. With no Security Token, the signature headers are
  absent. A `notify_url` postback stays unsigned. See [Verifying the signature](#verifying-the-signature).
- **Reconcile** — fulfill only after `GET /v2/{resource}/{id}`. The signature authenticates the POST;
  the API response is the source of truth for the resource. Do not fulfill from the event body alone.

## Verifying the signature

Pagou signs a webhook POST when that webhook subscription has a **Security Token**.

In the dashboard, open **Settings → Integrations**, then create or edit the webhook. Set the
Security Token, or leave it blank to generate one automatically (“Leave blank to generate
automatically.”). Put the same value in `PAGOU_SECURITY_TOKEN` on your server. The TypeScript
receiver in this repository reads that variable.

When a Security Token is configured, the POST includes:

| Header | Value |
| --- | --- |
| `X-Pagou-Timestamp` | Unix time in seconds, as a decimal string. |
| `X-Pagou-Signature` | `sha256=` followed by the lowercase hex HMAC-SHA256 digest. |
| `Content-Type` | `application/json` |
| `User-Agent` | `Pagou.ai - Webhook Service` |

`Content-Type` and `User-Agent` are on every webhook POST. `X-Pagou-Timestamp` and
`X-Pagou-Signature` are present only when a Security Token is configured. With no Security Token,
those two headers are omitted.

The signature is HMAC-SHA256 over the UTF-8 string `` `${timestamp}.${rawBody}` ``, using the
Security Token as the key. `rawBody` is the exact HTTP body. When the payload is a JSON object,
Pagou signs `JSON.stringify` of that object (no extra whitespace). Verify those bytes before you
parse JSON. Parsing and serializing again changes the signature.

Compare `X-Pagou-Signature` to the expected `sha256=<hex>` with a timing-safe compare of equal-length
buffers. Reject a timestamp more than 5 minutes from your clock, in either direction. That replay
window is your receiver's check.

A `notify_url` on a transaction or transfer, and any other postback that is not a webhook
subscription with a Security Token, stays **unsigned**. Leave `PAGOU_SECURITY_TOKEN` unset on a
receiver that must accept those calls.

Keep reconciling with `GET /v2/{resource}/{id}` before you fulfill. The signature shows the POST
came from Pagou. The API response is still what you fulfill against.

**Warning:** do not use the scheme at [docs.pagou.com.br](https://docs.pagou.com.br). That site
documents a different product: the timestamp and body are concatenated with no `.`, there is no
`sha256=` prefix, and the HMAC key is the API key.

The working check is [`typescript/webhooks/verify.ts`](../../typescript/webhooks/verify.ts). It
reads the raw body before `JSON.parse` when `PAGOU_SECURITY_TOKEN` is set.

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
