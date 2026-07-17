# Contributing

Thanks for helping improve the Pagou API v2 examples. This guide explains how the repository is
organized and what every contribution must satisfy.

## Ground rules

- These examples are a practical reference, not an SDK and not framework-specific. Use an idiomatic
  HTTP client with as few dependencies as possible.
- The [OpenAPI snapshot](shared/contracts/openapi-v2.json) is the source of truth for endpoints,
  methods and fields. Do not invent endpoints or fields that are not in it. If an example needs
  something absent from the contract, the contract check must fail — fix the example, not the check.
- Code, identifiers and technical comments are written in **English**. The top-level READMEs are
  maintained in English and Brazilian Portuguese.
- Keep code comments short. Do not write long, multi-line explanatory comments.

## Repository structure

```
/
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

Language directories never overlap, so parallel contributions stay conflict-free. Do not edit files
outside the scope of your change.

## Branch and PR workflow

1. Branch from `main` using `pag-<id>-<slug>` (or a short descriptive slug if there is no ticket).
2. Make your change within a single language directory or a single shared area.
3. Ensure it builds, lints and tests green locally.
4. Open a pull request against `main` using the pull request template.
5. Fill in the template completely, including the flow-matrix mapping.

Rules:

- No force pushes. Resolve conflicts by merging or rebasing cleanly.
- Do not use a `/_private` prefix in any route.
- Keep pull requests focused; one flow or one fix per PR where possible.

## Coverage matrix requirement

Every change that adds, completes or removes a flow implementation **must** be reflected in coverage.
The pull request template requires you to confirm this.

- Language contributors: do **not** edit [`docs/coverage-matrix.md`](docs/coverage-matrix.md) directly —
  it is consolidated centrally to avoid merge conflicts. Instead, add or update a `coverage.json` in
  your language directory listing each flow's state: `complete`, `partial`, `planned` or
  `not-applicable`.
- The docs rollout process consolidates those `coverage.json` files into the published matrix.

## Security checklist (enforced in CI)

Every contribution must honor these invariants:

- No real keys, tokens, documents, PAN or CVV are committed. `.env.example` holds placeholders only.
- The API key is never read in browser code.
- Card data uses only the Payment Element / Elements → `pgct_*` token. No example accepts PAN or CVV at
  the backend.
- All fixtures are synthetic.
- Logs redact `Authorization`, tokens and sensitive payloads.
- Only the public UUID `identifier` returned by the API is used to reference resources.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Definition of done

- Builds, lints and tests pass locally.
- Branch pushed and PR opened against `main` with a description that maps to the flow matrix.
- `coverage.json` present and accurate for the affected language.
- No secrets committed; security invariants honored.
