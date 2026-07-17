# Coverage matrix

This matrix tracks which core flows are implemented in each language. It is the single source of truth
for repository scope.

## States

| State | Meaning |
| --- | --- |
| `complete` | Implemented, tested, and documented to the flow README standard. |
| `partial` | Some sub-steps implemented; not yet the full flow. |
| `planned` | In scope, not yet implemented. |
| `not-applicable` | Deliberately out of scope for this language. |

## How this file is maintained

Language contributors do **not** edit this file directly (it would cause merge conflicts across
parallel PRs). Each language directory carries a `coverage.json` declaring its per-flow state, and the
docs rollout process consolidates those files into the table below.

## Matrix

Rows are flows; columns are languages. All cells are seeded as `planned`. The Docs column links to the
matching page on the official documentation site (https://developer.pagou.ai/).

| Flow | Docs | TypeScript | Python | PHP | Java | .NET | Go | Ruby |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Payments | [docs](https://developer.pagou.ai/payments) | planned | planned | planned | planned | planned | planned | planned |
| Checkout links | [docs](https://developer.pagou.ai/payments) | planned | planned | planned | planned | planned | planned | planned |
| Customers & subscriptions | [docs](https://developer.pagou.ai/subscriptions) | planned | planned | planned | planned | planned | planned | planned |
| Transfers (Pix Out) | [docs](https://developer.pagou.ai/payouts) | planned | planned | planned | planned | planned | planned | planned |
| Webhooks | [docs](https://developer.pagou.ai/webhooks) | planned | planned | planned | planned | planned | planned | planned |

## Runtime versions

Minimum and current runtime versions per language are tracked here as each language stabilizes.

| Language | Minimum runtime | Current runtime |
| --- | --- | --- |
| TypeScript / Node | TBD | TBD |
| Python | TBD | TBD |
| PHP | TBD | TBD |
| Java | TBD | TBD |
| .NET | TBD | TBD |
| Go | TBD | TBD |
| Ruby | TBD | TBD |
