# Webhooks

A real receiver for the three current envelope families. It applies every rule a production handler
needs: verify the HMAC signature on the raw body when `PAGOU_SECURITY_TOKEN` is set, parse the
envelope, require the event id, dedupe redeliveries, answer `2xx` fast, offload the slow work, and
change business state only on a confirmed event after reconciling against the API.

- **Guides:** [Webhooks overview](https://developer.pagou.ai/webhooks/overview) ·
  [Payment events](https://developer.pagou.ai/webhooks/payment-events) ·
  [Transfer events](https://developer.pagou.ai/webhooks/transfer-events) ·
  [Retries & reconciliation](https://developer.pagou.ai/webhooks/retries-and-reconciliation) ·
  [Subscription events](https://developer.pagou.ai/subscriptions/webhooks)

## Prerequisites

Node 18.18+ and a sandbox `PAGOU_API_TOKEN` (reconciliation calls the API). Configure
`PAGOU_WEBHOOK_URL` under **Settings → Integrations** so it points at this receiver's public URL.
To sign those POSTs, set a **Security Token** on the webhook (create or edit). Leave the field
blank to generate one automatically (“Leave blank to generate automatically.”), then store the
value in `PAGOU_SECURITY_TOKEN`.

**Sandbox dependency:** reconciliation reads live sandbox resources.

## Run command

```bash
npm run webhooks:server   # POST envelopes to http://localhost:4000/webhooks/pagou
```

Try it with a fixture. This unsigned request is accepted only when `PAGOU_SECURITY_TOKEN` is unset
or empty. With a Security Token configured, add `X-Pagou-Timestamp` and `X-Pagou-Signature`
(see [Verifying the signature](#verifying-the-signature)).

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
- **Signature** — when `PAGOU_SECURITY_TOKEN` is set, `verify.ts` checks `X-Pagou-Signature` on the
  raw body before `JSON.parse` (`server.ts`). With no Security Token, the signature headers are
  absent and this receiver accepts the POST. A `notify_url` postback stays unsigned.
  See [Verifying the signature](#verifying-the-signature).
- **Reconcile** — fulfill only after `GET /v2/{resource}/{id}`. The signature authenticates the POST;
  the API response is the source of truth for the resource. Do not fulfill from the event body alone.

## Verifying the signature

Pagou signs a webhook POST when that webhook subscription has a **Security Token**.

In the dashboard, open **Settings → Integrations**, then create or edit the webhook. Set the
Security Token, or leave it blank to generate one automatically (“Leave blank to generate
automatically.”). Put the same value in `PAGOU_SECURITY_TOKEN`.

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
Pagou signs `JSON.stringify` of that object (no extra whitespace). Read the raw body and verify it
before parsing. Parsing and serializing again changes the signature.

Compare `X-Pagou-Signature` to the expected `sha256=<hex>` with a timing-safe compare of equal-length
buffers (`crypto.timingSafeEqual`). Reject a timestamp more than 5 minutes from your clock, in
either direction. That replay window is your receiver's check.

A `notify_url` on a transaction or transfer, and any other postback that is not a webhook
subscription with a Security Token, stays **unsigned**. Leave `PAGOU_SECURITY_TOKEN` unset to accept
those calls. With the variable set, this server answers `401` when the signature is missing, wrong,
or outside the replay window.

Keep reconciling with `GET /v2/{resource}/{id}` before you fulfill. The signature shows the POST
came from Pagou. The API response is still what you fulfill against.

These headers are on the webhook POST Pagou sends to your URL. This repository's OpenAPI snapshot
does not describe webhook POSTs, so the headers are documented here rather than added to
[`shared/contracts/openapi-v2.json`](../../shared/contracts/openapi-v2.json).

### This receiver

`verify.ts` runs before `JSON.parse`. `PAGOU_SECURITY_TOKEN` must equal the webhook's Security Token.

| HTTP | Body | When |
| --- | --- | --- |
| `401` | `{ "error": "missing_signature" }` | A Security Token is configured and either header is missing. |
| `401` | `{ "error": "invalid_signature" }` | The MAC does not match the Security Token and the raw body. |
| `401` | `{ "error": "stale_timestamp" }` | The MAC matches, and the timestamp is not Unix seconds inside ±5 minutes. |

Build the headers the same way Pagou does:

```ts
import { createHmac } from "node:crypto";

const timestamp = String(Math.floor(Date.now() / 1000));
const rawBody = /* exact request body string */;
const signature =
  "sha256=" +
  createHmac("sha256", process.env.PAGOU_SECURITY_TOKEN ?? "")
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
```

Send `X-Pagou-Timestamp` and `X-Pagou-Signature` with that same body. `signWebhook` in
[`verify.ts`](./verify.ts) returns the same header value.

## Minimal persistence

Two tables (in-memory here): processed event ids for idempotency, and the reconciled resource state
you actually fulfill against. Back both with a database in production.

## Expected error and recovery

- **`400 missing_event_id`** — the envelope had no `id`; Pagou includes one on webhook POSTs.
- **`401 missing_signature` / `invalid_signature` / `stale_timestamp`** — `PAGOU_SECURITY_TOKEN` is
  set and the POST failed the HMAC or the ±5 minute check. Confirm the Security Token, verify the
  raw body (not a re-serialized object), and check the clock.
- **Reconciliation failure after the ack** — logged; a production system requeues the event for a
  later retry rather than replaying side effects.

## Test

`npm test` covers envelope routing for all three families, the missing-id rejection, dedupe, the
confirmed-vs-informational gate, and that `processEvent` reconciles and updates state only on a
confirmed event ([`../tests/webhooks.test.ts`](../tests/webhooks.test.ts)). Signature tests cover a
valid MAC over the raw body, a different Security Token, missing headers, a stale timestamp, an
incorrect scheme (no dot, no `sha256=` prefix), an HTTP POST that is verified before
`JSON.parse`, and a GET reconcile after a valid signature
([`../tests/webhook-signature.test.ts`](../tests/webhook-signature.test.ts)).
