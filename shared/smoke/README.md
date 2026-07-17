# Smoke tests

Thin, cross-flow smoke checks used by the sandbox smoke-test CI job. Zero dependencies, Node >= 18.

```sh
node shared/smoke/smoke.mjs <pix|retrieve|transfer|webhook|all> [id]
```

| Command | Network | Checks |
| --- | --- | --- |
| `pix` | yes | create a Pix transaction, assert `data.pix.qr_code` |
| `retrieve` | yes | retrieve a transaction (creates one if no id given) |
| `transfer` | yes | create a Pix Out transfer |
| `webhook` | no | classify the 3 webhook envelope families and prove idempotent dedupe |
| `all` | yes | pix → retrieve → transfer → webhook |

## Environment

- `PAGOU_BASE_URL` — defaults to `https://api.sandbox.pagou.ai`. Point at the mock server
  (`http://localhost:4010`) to run everything offline.
- `PAGOU_API_KEY` — required for the network commands. When unset, they exit `78` (skipped), so the
  CI job is a no-op until the sandbox secret is configured.

The webhook command is always offline and safe to run anywhere.
