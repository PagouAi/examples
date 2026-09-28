# Webhooks

A real receiver for the three current envelope families. It applies every rule a production handler
needs: verify the HMAC signature on the raw body when `PAGOU_WEBHOOK_SECRET` is set, parse the
envelope, require the event id, dedupe redeliveries, answer `2xx` fast, offload the slow work, and
change business state only on a confirmed event after reconciling against the API.

- **Guides:** [Webhooks overview](https://developer.pagou.ai/webhooks/overview) ·
  [Payment events](https://developer.pagou.ai/webhooks/payment-events) ·
  [Transfer events](https://developer.pagou.ai/webhooks/transfer-events) ·
  [Retries & reconciliation](https://developer.pagou.ai/webhooks/retries-and-reconciliation) ·
  [Subscription events](https://developer.pagou.ai/subscriptions/webhooks)

## Prerequisites

Node 18.18+ and a sandbox `PAGOU_API_TOKEN` (reconciliation calls the API). Configure
`PAGOU_WEBHOOK_URL` in your dashboard to point at this receiver's public URL. When that endpoint
has a `secret_token`, set the same value as `PAGOU_WEBHOOK_SECRET`.
**Sandbox dependency:** reconciliation reads live sandbox resources.

## Run command

```bash
npm run webhooks:server   # POST envelopes to http://localhost:4000/webhooks/pagou
```

Try it with a fixture. This unsigned request is accepted only when `PAGOU_WEBHOOK_SECRET` is unset
or empty. With a secret configured, add `X-Pagou-Timestamp` and `X-Pagou-Signature` (see below).

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
  "missing_event_id" }` (`handlers.ts` → `server.ts`).
- **Dedupe redelivery** — `store.markProcessed(id)` returns `true` once; any redelivery is
  acknowledged `200 { "received": true }` without reprocessing.
- **Respond 2xx fast** — the ack is sent before any API call; the reconciliation runs in
  `setImmediate` (`server.ts`).
- **Offload slow work** — `processor.processEvent` does the reconciliation off the response path.
- **State change only on confirmed** — `handlers.isConfirmedStateChange` gates which events trigger
  a reconcile; informational events (`transaction.created`, `subscription.trial_will_end`) never
  change state.
- **Signature** — when the endpoint `secret_token` is non-empty, verify `X-Pagou-Signature` on the
  raw body before `JSON.parse` (`verify.ts`, used by `server.ts`). An empty secret leaves the
  delivery unsigned.
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
`rawBody` is the exact HTTP body. When the sender holds an object it signs `JSON.stringify(object)`
(default JSON, no extra whitespace). A body that is already a string is signed as that string.
Read the raw body and verify it before parsing. Re-serializing the parsed object changes the MAC.

Compare the header to the expected `sha256=<hex>` with a timing-safe compare on equal-length
buffers (`crypto.timingSafeEqual`). Reject a timestamp more than 5 minutes from your clock in
either direction. That replay window is a receiver recommendation: the sender does not enforce one.

An empty, null, or omitted `secret_token` means `X-Pagou-Timestamp` and `X-Pagou-Signature` are
absent. A per-transaction or per-transfer `notify_url`, and any other postback queued without
`secret_token`, stays unsigned. Leave `PAGOU_WEBHOOK_SECRET` unset on a receiver that must accept
those unsigned calls. With the variable set, this server answers `401` for a missing or bad signature.

Set `secret_token` in the dashboard webhook configuration, or through the webhook API when you
create or update the endpoint. Outbound `X-Pagou-*` headers are added by the delivery service.
They are not request operations in [`shared/contracts/openapi-v2.json`](../../shared/contracts/openapi-v2.json);
that snapshot has no webhook-endpoint management surface.

**Warning:** do not implement the scheme published at [docs.pagou.com.br](https://docs.pagou.com.br).
That site documents a different product: timestamp and payload concatenated with no `.`, no `sha256=`
prefix, and the API key as the HMAC secret.

### This receiver

`verify.ts` runs before `JSON.parse`. `PAGOU_WEBHOOK_SECRET` must equal the endpoint `secret_token`.

| HTTP | Body | When |
| --- | --- | --- |
| `401` | `{ "error": "missing_signature" }` | Secret is set and either header is missing. |
| `401` | `{ "error": "invalid_signature" }` | The MAC does not match the secret and the raw body. |
| `401` | `{ "error": "stale_timestamp" }` | The MAC matches, and the timestamp is not Unix seconds inside ±5 minutes. |

Build the headers the same way the sender does:

```ts
import { createHmac } from "node:crypto";

const timestamp = String(Math.floor(Date.now() / 1000));
const rawBody = /* exact request body string */;
const signature =
  "sha256=" +
  createHmac("sha256", process.env.PAGOU_WEBHOOK_SECRET ?? "")
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
```

Send `X-Pagou-Timestamp: <timestamp>` and `X-Pagou-Signature: <signature>` with that same body.

## Minimal persistence

Two tables (in-memory here): processed event ids for idempotency, and the reconciled resource state
you actually fulfill against. Back both with a database in production.

## Expected error and recovery

- **`400 missing_event_id`** — the envelope had no `id`; the sender should include it.
- **`401 missing_signature` / `invalid_signature` / `stale_timestamp`** — `PAGOU_WEBHOOK_SECRET` is
  set and the delivery failed the HMAC or replay check. Fix the secret, the raw body, or the clock,
  then let Pagou retry.
- **Reconciliation failure after the ack** — logged; a production system requeues the event for a
  later retry rather than replaying side effects.

## Test

`npm test` covers envelope routing for all three families, the missing-id rejection, dedupe, the
confirmed-vs-informational gate, and that `processEvent` reconciles and updates state only on a
confirmed event ([`../tests/webhooks.test.ts`](../tests/webhooks.test.ts)). Signature tests cover a
valid MAC, the wrong secret, missing headers when a secret is configured, a stale timestamp, and
that a valid signature still reconciles with GET
([`../tests/webhook-signature.test.ts`](../tests/webhook-signature.test.ts)).
