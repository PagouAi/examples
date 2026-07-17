# Test harness & CI

The harness lets every language example be built and verified the same way: against synthetic fixtures,
a contract-faithful mock server, and a contract check that fails when examples drift from the OpenAPI v2
snapshot. It is language-agnostic and lives entirely under `shared/` and `.github/`.

## Components

| Piece | Path | What it does |
| --- | --- | --- |
| Fixtures | `shared/fixtures/` | Synthetic payloads for every flow (see `index.json`). |
| Mock server | `shared/mock-server/` | Zero-dep Node server replaying the v2 contract for local dev and contract tests. |
| Contract tools | `shared/contracts/tools/` | Manifest generator + validator (operations & fields vs. OpenAPI). |
| Smoke | `shared/smoke/` | Cross-flow PIX / retrieve / transfer / webhook checks. |

Everything Node-based targets Node >= 18 and has **no npm dependencies** — no `npm install` needed.

## Contract check (the drift gate)

`used-operations.json` declares the operations and dotted field paths the examples use. CI runs:

```sh
node shared/contracts/tools/generate-manifest.mjs --check   # manifest in sync with the snapshot?
node shared/contracts/tools/contract-check.mjs              # operations + fields valid? fixtures parse?
```

If an example needs an operation, method or field that is not in `shared/contracts/openapi-v2.json`, the
check fails — the example must be fixed or the snapshot deliberately refreshed. See
`shared/contracts/tools/README.md`.

## Mock server & contract test

```sh
node shared/mock-server/server.mjs                 # http://localhost:4010
cd shared/mock-server && node --test "test/*.test.mjs"
```

The contract test boots the server and validates every response against the OpenAPI response schema.
Point any example at it offline with `PAGOU_BASE_URL=http://localhost:4010`.

## CI workflows

All workflows are reusable (`workflow_call`) and orchestrated by `.github/workflows/ci.yml`, which uses
path filters so isolated changes only run the relevant jobs.

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `reusable-secret-scan.yml` | always | gitleaks + a repo-specific backstop; **blocks merge on credentials**. |
| `reusable-contract-check.yml` | shared/any language changed | manifest + field validation vs. the snapshot. |
| `reusable-contract-test.yml` | shared/any language changed | boots the mock server, runs the contract test. |
| `reusable-language.yml` | that language dir changed | lint + build + test across a min+current runtime matrix. |
| `reusable-sandbox-smoke.yml` | shared/any language changed | PIX/retrieve/transfer/webhook; network flows gated by `PAGOU_SANDBOX_API_KEY`. |
| `reusable-coverage.yml` | shared/any language changed | aggregates each dir's `coverage.json` into a matrix report. |

### Runtime matrix (min + current)

| Language | Versions |
| --- | --- |
| TypeScript / Node | 18, 22 |
| Python | 3.9, 3.13 |
| PHP | 8.1, 8.3 |
| Java | 17, 21 |
| .NET | 6.0, 8.0 |
| Go | 1.21, 1.23 |
| Ruby | 3.1, 3.3 |

The per-language runner (`.github/scripts/language-ci.sh`) detects each project manifest and runs the
idiomatic install/lint/build/test. Languages with no example yet are skipped, so the matrix is green
before the examples land.

### Sandbox smoke gate

The sandbox job runs the offline webhook check always, and the network flows (PIX create, retrieve,
transfer) only when the `PAGOU_SANDBOX_API_KEY` repository secret is configured. No secret is ever
committed; `.env.example` holds placeholders only.

### Coverage matrix

Language workers drop a `coverage.json` in their dir (`{ "language": …, "flows": { "payments":
"complete", … } }`); the coverage job renders the flow × language matrix to the job summary and uploads
it as an artifact. The consolidated `docs/coverage-matrix.md` is owned separately by the docs rollout.
