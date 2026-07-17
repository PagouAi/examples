# Contracts

Pinned API contract artifacts the examples target.

- **`openapi-v2.json`** — a snapshot of the Pagou API v2 OpenAPI specification. This is the source of
  truth for endpoints, methods and fields. Examples must not use anything absent from it.
- **`used-operations.json`** — a manifest of the operations the examples exercise, grouped by flow. The
  contract check validates each listed operation against `openapi-v2.json` (operationId, method, path).
  Entries are seeded with `used: false` and flip to `true` as examples land.

Update `openapi-v2.json` only via a deliberate snapshot refresh, keeping `used-operations.json` in sync.
