# Pagou API v2 — Examples

Runnable, testable, cross-language examples for the core flows of the **Pagou API v2**.

This repository is a practical reference that complements the [official documentation](https://developer.pagou.ai/)
and the OpenAPI specification. It is **not** an SDK and it is **not** framework-specific — every
example uses an idiomatic HTTP client with as few dependencies as possible, so the same integration
patterns translate across languages.

> **Status: beta.** All mandatory V1 flows are implemented, tested and owned across the seven
> languages — see the [coverage matrix](docs/coverage-matrix.md). The badge remains until the docs
> Examples area lands and owner teams are assigned; the [rollout checklist](docs/rollout-checklist.md)
> tracks what is left. Browse the guides in the **Examples** area at
> [developer.pagou.ai/examples/overview](https://developer.pagou.ai/examples/overview).

Português: [README.pt-BR.md](README.pt-BR.md)

## What is covered

Each language mirrors the same set of core flows:

- **Payments** — create a Pix charge and return the `pix.qr_code`; retrieve and reconcile a
  transaction; voucher/boleto with asynchronous instructions; card via Payment Element (browser)
  → `pgct_*` token → backend, continuing 3DS on `next_action`; full and partial refunds; list
  transactions with cursor pagination.
- **Checkout links** — create a link and store the returned public identifier.
- **Customers & subscriptions** — create/reuse a customer; create, retrieve and cancel a
  subscription; handle renewal, failure, past-due and cancellation events.
- **Transfers (Pix Out)** — create, retrieve and reconcile a transfer; cancel when the status
  allows; reach the final state via webhook.
- **Webhooks** — real handlers for the transaction, subscription and transfer event families.

## Languages

| Language | Directory |
| --- | --- |
| TypeScript / Node | [`typescript/`](typescript/) |
| Python | [`python/`](python/) |
| PHP | [`php/`](php/) |
| Java | [`java/`](java/) |
| C# / .NET | [`dotnet/`](dotnet/) |
| Go | [`go/`](go/) |
| Ruby | [`ruby/`](ruby/) |

## From sandbox credentials to a first run

Every example runs against the **sandbox** by default. You never need production credentials to try
this repository.

1. **Get a sandbox token.** Sign in to your Pagou dashboard and create a sandbox API token. Sandbox
   and production tokens are separate — keep them that way.
2. **Pick a language and flow.** Open the language directory (for example [`typescript/`](typescript/))
   and read its `README.md`.
3. **Configure the environment.** Copy `.env.example` to `.env` in that language directory and set
   your sandbox token. The base URL defaults to the sandbox server:

   | Environment | Base URL |
   | --- | --- |
   | Sandbox | `https://api.sandbox.pagou.ai` |
   | Production | `https://api.pagou.ai` |

4. **Run a flow.** Each flow README documents a single run command, the input payload, the relevant
   response, and the expected error and recovery path.

A minimal sanity check — list transactions to confirm authentication and network path:

```bash
curl --request GET \
  --url https://api.sandbox.pagou.ai/v2/transactions \
  --header "Authorization: Bearer YOUR_SANDBOX_TOKEN"
```

A `200` response means your credentials and environment are ready.

## Authentication

All v2 routes require authentication. Choose **one** scheme and use it consistently:

- `Authorization: Bearer <token>` (recommended default)
- `apiKey: <token>` header
- Basic auth with username `token` and password `x`

The API key is a **server-side** secret. It is never read in browser code. Card data is captured only
through the Payment Element / Elements and exchanged for a `pgct_*` token before it reaches your
backend — no example accepts a PAN or CVV directly.

## Security invariants

These rules are enforced in CI and are non-negotiable:

- No real keys, tokens, documents, PAN or CVV are ever committed. `.env.example` holds placeholders only.
- The API key is never read in browser code.
- Card data uses only the Payment Element / Elements → `pgct_*` token.
- All fixtures are synthetic.
- Logs redact `Authorization`, tokens and sensitive payloads.
- Only the public UUID `identifier` returned by the API is used to reference resources.

See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## Repository layout

```
/
  README.md  README.pt-BR.md  LICENSE  SECURITY.md  CONTRIBUTING.md  CODEOWNERS
  .github/    workflows, issue templates, PR template, dependabot config
  docs/       coverage-matrix.md, architecture.md, troubleshooting.md
  shared/     fixtures/ (synthetic), contracts/ (OpenAPI snapshot + used-operations manifest)
  typescript/ python/ php/ java/ dotnet/ go/ ruby/
```

Each language directory shares the same conceptual structure:

```
<language>/
  README.md   .env.example
  payments/   checkout-links/   subscriptions/   transfers/   webhooks/   tests/
```

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first — it explains the branch and
PR workflow, the coverage-matrix requirement, and the security checks every change must pass.

## License

[MIT](LICENSE)
