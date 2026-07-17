import { PagouHttpClient } from "../../src/lib/http.js";
import { formatAmount, idempotencyKey, printResult } from "../../src/lib/format.js";
import { InvalidRequestError } from "../../src/lib/errors.js";
import type { RefundResult } from "../../src/lib/types.js";
import { resourceIdFromArgs } from "../demo-data.js";

// Refunds a transaction. Omit the amount for a full refund; pass cents for a
// partial one. The refund is idempotent via an Idempotency-Key so a retry after
// a network blip never double-refunds.
// Run: npm run pay:refund -- <transaction_id> [amount_cents]
async function main(): Promise<void> {
  const id = resourceIdFromArgs("PAGOU_TRANSACTION_ID");
  const amountArg = process.argv[3];
  const amount = amountArg ? Number(amountArg) : undefined;
  const client = new PagouHttpClient();

  try {
    const { data: refund } = await client.requestData<RefundResult>({
      method: "PUT",
      path: `/v2/transactions/${id}/refund`,
      body: amount !== undefined ? { amount, reason: "requested_by_customer" } : { reason: "requested_by_customer" },
      idempotencyKey: idempotencyKey("refund", `${id}_${amount ?? "full"}`),
    });

    console.log(refund.is_full_refund ? "Full refund processed." : "Partial refund processed.");
    printResult("Refund", {
      amount_refunded: formatAmount(refund.amount_refunded),
      remaining_balance: formatAmount(refund.remaining_balance),
    });
  } catch (error) {
    if (error instanceof InvalidRequestError) {
      console.error(`Refund rejected: ${error.message}`);
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
