# Contract tools

Zero-dependency Node (ESM) utilities that keep the examples honest against the OpenAPI v2 snapshot.
Requires Node >= 18. No `npm install` needed.

## `generate-manifest.mjs`

Rebuilds `used-operations.json` from `openapi-v2.json`. It groups operations by flow (via OpenAPI tags),
and **preserves** the human-maintained `used` flags and `fields` lists from the existing manifest. Inbound
webhook envelopes have no OpenAPI operation, so they are carried through untouched.

```sh
node generate-manifest.mjs          # rewrite used-operations.json
node generate-manifest.mjs --check  # exit 1 if the manifest is stale (for CI)
```

## `contract-check.mjs`

The validator CI runs. It fails (exit 1) on any divergence between what the examples declare and the
contract:

1. **Sync** — the manifest's operation set/methods/paths must match what the snapshot produces.
2. **Operations** — every declared operationId must exist with the same method and path.
3. **Fields** — every dotted `fields` entry must resolve in that operation's request or response schema
   (allOf/anyOf/oneOf and array items are followed).
4. **Webhooks** — the `transactions`, `subscriptions` and `transfers` envelope families must be present
   and well-formed.
5. **Fixtures** — every `shared/fixtures/*.json` must be valid JSON.

Operations present in the contract but not tracked in the manifest are reported as warnings (coverage),
not failures.

```sh
node contract-check.mjs
```

## `lib/openapi.mjs`

Shared helpers: `loadSpec`, `loadManifest`, `listOperations`, `operationIndex`, `buildManifest`,
`fieldExists`. Reused by both scripts and the mock server's tests.
