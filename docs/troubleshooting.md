# Troubleshooting

Common issues when running the examples against the Pagou API v2 sandbox, and how to resolve them.

## `401 Unauthorized`

```json
{
  "type": "https://api.pagou.ai/problems/unauthorized",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Authentication credentials were not provided or are invalid."
}
```

- Confirm the token belongs to the environment you are calling (sandbox token → sandbox base URL).
- Do not mix auth schemes. Use one of `Authorization: Bearer`, the `apiKey` header, or Basic auth
  consistently.
- Make sure the token is set in `.env` and actually loaded by the example.

## Wrong environment / base URL

- Sandbox is `https://api.sandbox.pagou.ai`; production is `https://api.pagou.ai`.
- Sandbox and production tokens are not interchangeable. A production token against the sandbox URL (or
  vice versa) returns `401`.

## Nothing happens after creating a Pix / transfer

Async outcomes are confirmed by webhook or by reconciliation, not immediately in the create response.

- Ensure your webhook endpoint is reachable over HTTPS and returns `2xx` quickly.
- If you cannot receive webhooks locally, reconcile by polling `GET /v2/transactions/{id}` or
  `GET /v2/transfers/{id}`.

## Webhook handler issues

- Respond `2xx` fast and offload slow work; a slow handler causes redelivery.
- Dedupe by event ID and ignore already-processed redeliveries.
- Update business state only on a confirmed webhook or server-side reconciliation.
- Check the envelope family you are handling:
  - transactions: `event = transaction` + `data.event_type`
  - subscriptions: `event = subscription` + `data.event_type`
  - transfers: `type` + `data.object`

## Card flow returns no charge

- Card data must be captured by the Payment Element / Elements, which returns a `pgct_*` token. The
  backend never receives a PAN or CVV.
- If the response contains a `next_action`, continue the 3DS step before expecting a final status.

## Validation errors on create

- Validate your request shape against the [OpenAPI snapshot](../shared/contracts/openapi-v2.json). The
  examples never use fields that are not in the contract.
- Amounts are in the smallest currency unit (for example, cents for `BRL`).
- Use your own stable `external_ref` as the idempotency key for creates.

## Retries and timeouts

- Retry only transient failures (network errors, `5xx`) on idempotent operations.
- Do not retry a create without the same `external_ref`, or you may create duplicates.
- Set a request timeout; do not block indefinitely.

## Still stuck?

- Check the [architecture overview](architecture.md).
- Read the flow's README in your language directory.
- If you found a bug in an example, open a **Broken example** issue.
