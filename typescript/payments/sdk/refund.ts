import { InvalidRequestError } from "@pagouai/api-sdk";
import { createSdkClient } from "../../src/lib/sdk.js";
import { formatAmount, idempotencyKey, printResult } from "../../src/lib/format.js";
import type { RefundResult } from "../../src/lib/types.js";
import { resourceIdFromArgs } from "../demo-data.js";

// Full or partial refund with the SDK. The SDK sends the Idempotency-Key and
// retries transient failures because the key is present.
// Run: npm run pay:refund:sdk -- <transaction_id> [amount_cents]
async function main(): Promise<void> {
  const id = resourceIdFromArgs("PAGOU_TRANSACTION_ID");
  const amountArg = process.argv[3];
  const amount = amountArg ? Number(amountArg) : undefined;
  const client = createSdkClient();

  try {
    const { data } = await client.transactions.refund(
      id,
      { ...(amount !== undefined ? { amount } : {}), reason: "requested_by_customer" },
      { idempotencyKey: idempotencyKey("refund", `${id}_${amount ?? "full"}`) },
    );
    const refund = data as unknown as RefundResult;
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
