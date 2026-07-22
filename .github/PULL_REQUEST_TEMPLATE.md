<!-- Keep the description mapped to the flow matrix. No AI/Claude mentions. No co-authoring. -->

## Summary

<!-- What does this PR add or change? -->

## Flow matrix mapping

- **Language(s):** <!-- e.g. TypeScript -->
- **Flow(s):** <!-- Payments | Checkout links | Customers & subscriptions | Transfers (Pix Out) | Webhooks -->
- **New state:** <!-- complete | partial | planned | not-applicable -->

## Coverage update (required)

- [ ] I updated `coverage.json` in the affected language directory to reflect the new flow state(s).
- [ ] I did **not** edit `docs/coverage-matrix.md` directly (it is consolidated centrally).

## Contract

- [ ] Every endpoint, method and field I use exists in `shared/contracts/openapi-v2.json`.
- [ ] `shared/contracts/used-operations.json` is updated if this PR exercises new operations.

## Contract change gate (required if this PR touches `shared/contracts/`)

If this PR updates the OpenAPI snapshot or `used-operations.json`, every example that exercises an
affected operation must be reviewed and re-run. Leave unchecked if `shared/contracts/` is untouched.

- [ ] This PR does **not** modify `shared/contracts/`, **or** I have reviewed each affected example.
- [ ] For every changed operation, the examples using it still build, lint and pass tests against the new contract.
- [ ] `docs/coverage-matrix.md` states and the docs Examples area are still accurate after the change.
- [ ] A code owner from each affected language (see `CODEOWNERS`) is requested for review.

## Security checklist

- [ ] No real keys, tokens, documents, PAN or CVV committed. `.env.example` has placeholders only.
- [ ] API key is never read in browser code.
- [ ] Card data uses only the Payment Element / Elements → `pgct_*` token.
- [ ] Fixtures are synthetic.
- [ ] Logs redact `Authorization`, tokens and sensitive payloads.
- [ ] Only the public UUID `identifier` returned by the API is used to reference resources.

## Checks

- [ ] Builds, lints and tests pass locally.
- [ ] The flow README documents run command, input, response, and expected error + recovery.
