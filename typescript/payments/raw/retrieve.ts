import { PagouHttpClient } from "../../src/lib/http.js";
import { printResult } from "../../src/lib/format.js";
import { NotFoundError } from "../../src/lib/errors.js";
import type { Transaction } from "../../src/lib/types.js";
import { resourceIdFromArgs } from "../demo-data.js";

// Retrieves a transaction by its public UUID.
// Run: npm run pay:retrieve -- <transaction_id>
async function main(): Promise<void> {
  const id = resourceIdFromArgs("PAGOU_TRANSACTION_ID");
  const client = new PagouHttpClient();

  try {
    const { data: tx } = await client.requestData<Transaction>({
      method: "GET",
      path: `/v2/transactions/${id}`,
    });
    printResult("Transaction", {
      id: tx.id,
      status: tx.status,
      amount: tx.amount,
      paid_amount: tx.paid_amount,
      refunded_amount: tx.refunded_amount,
      paid_at: tx.paid_at,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.error(`No transaction ${id}.`);
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
