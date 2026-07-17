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

## Security checklist

- [ ] No real keys, tokens, documents, PAN or CVV committed. `.env.example` has placeholders only.
- [ ] API key is never read in browser code.
- [ ] Card data uses only the Payment Element / Elements → `pgct_*` token.
- [ ] Fixtures are synthetic.
- [ ] Logs redact `Authorization`, tokens and sensitive payloads.
- [ ] Only public UUID `identifier`s are used — never serial IDs or `local_id`.

## Checks

- [ ] Builds, lints and tests pass locally.
- [ ] The flow README documents run command, input, response, and expected error + recovery.
