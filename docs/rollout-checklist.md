# Beta rollout checklist

This repository ships with a **beta** badge. The badge stays until every mandatory V1 flow has an
automated test **and** an explicit code owner, and the supporting docs, CI and governance below are in
place. This file tracks what is done and what remains before the badge is lifted.

## Exit criteria (all must be true to leave beta)

- [x] Every mandatory flow (Payments, Checkout links, Customers & subscriptions, Transfers, Webhooks)
      implemented in all seven V1 languages — see [coverage-matrix.md](coverage-matrix.md).
- [x] Every mandatory flow has an automated test in every language (vitest, pytest, phpunit, junit5,
      xUnit, go test, minitest).
- [x] Every language directory has an explicit owner in [`CODEOWNERS`](../CODEOWNERS).
- [x] Each V1 language has a runnable project + `.env.example` + `README.md` + tests.
- [x] Sandbox smoke tests cover PIX, retrieve, webhook and transfer
      (`.github/workflows/reusable-sandbox-smoke.yml`).
- [x] Consolidated coverage matrix published from each `coverage.json`.
- [x] Periodic full CI job runs all seven runtimes on a schedule (`.github/workflows/full-ci.yml`).
- [x] Markdown link checker wired (`.github/workflows/link-check.yml`).
- [x] Contract-change gate in the PR template + CONTRIBUTING.
- [ ] Docs "Examples" area (EN + PT-BR) merged and deployed on developer.pagou.ai. *(Docs monorepo PR
      to `canary` — open, pending review/merge.)*
- [ ] `CODEOWNERS` per-language owners moved from the interim `@jhon2c` to real GitHub teams once they
      exist.
- [ ] `PAGOU_SANDBOX_API_KEY` repository secret set so the network smoke steps run (they skip cleanly
      without it today).

## Status snapshot

| Area | State |
| --- | --- |
| Flow coverage (7 languages × 5 flows) | ✅ complete |
| Automated tests per language | ✅ present |
| Code owners per language | ✅ explicit (interim owner) |
| Coverage matrix consolidated | ✅ done |
| Full scheduled CI | ✅ wired |
| Link checker | ✅ wired |
| Contract-change gate | ✅ wired |
| Docs Examples area (EN + PT-BR) | 🟡 PR open to `canary` |
| Real owner teams in CODEOWNERS | ⬜ pending team creation |
| Sandbox smoke secret configured | ⬜ pending secret |

## What remains before lifting the beta badge

1. **Merge the docs Examples area.** The docs monorepo PR adds the bidirectional Examples area
   (EN + PT-BR). Merge to `canary` and let it deploy to developer.pagou.ai.
2. **Assign real owner teams.** Replace the interim `@jhon2c` entries in `CODEOWNERS` with the
   per-language teams once they exist in the GitHub org.
3. **Configure the sandbox secret.** Add `PAGOU_SANDBOX_API_KEY` so the smoke workflow exercises the
   live PIX / retrieve / transfer path instead of skipping it.

Once these three items are done, remove the beta note from `README.md` / `README.pt-BR.md` and close
this checklist.
