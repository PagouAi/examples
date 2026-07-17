# Contracts

Pinned API contract artifacts the examples target.

- **`openapi-v2.json`** — a snapshot of the Pagou API v2 OpenAPI specification. This is the source of
  truth for endpoints, methods and fields. Examples must not use anything absent from it.
- **`used-operations.json`** — a manifest of the operations the examples exercise, grouped by flow. Each
  operation carries `used` (flips to `true` as examples land) and an optional `fields` list of dotted
  paths the examples read or send. The contract check validates each operation (operationId, method,
  path) and each field against `openapi-v2.json`.
- **`used-operations.schema.json`** — JSON Schema for the manifest.
- **`tools/`** — the manifest generator and the contract validator (see `tools/README.md`).

## Commands

```sh
# Regenerate the manifest skeleton from the OpenAPI snapshot (preserves used/fields).
node shared/contracts/tools/generate-manifest.mjs

# Fail if the checked-in manifest is stale vs. the snapshot.
node shared/contracts/tools/generate-manifest.mjs --check

# Validate operations + fields used by examples against the snapshot. Fails on divergence.
node shared/contracts/tools/contract-check.mjs
```

Update `openapi-v2.json` only via a deliberate snapshot refresh, then run the generator so
`used-operations.json` stays in sync. The contract-check job in CI blocks any drift.
