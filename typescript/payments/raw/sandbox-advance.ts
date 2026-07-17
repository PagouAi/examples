import { PagouHttpClient } from "../../src/lib/http.js";
import { printResult } from "../../src/lib/format.js";
import type { TransactionStatus } from "../../src/lib/types.js";
import { resourceIdFromArgs } from "../demo-data.js";

// Sandbox-only helper: forces a transaction to a target status so you can
// exercise the paid/refunded paths without a real payer. Never available in
// production. Run: npm run pay:pix, then:
// npx tsx payments/raw/sandbox-advance.ts <transaction_id> [status=paid]
async function main(): Promise<void> {
  const id = resourceIdFromArgs("PAGOU_TRANSACTION_ID");
  const status = (process.argv[3] ?? "paid") as TransactionStatus;
  const client = new PagouHttpClient();

  const { data } = await client.requestData<{ transaction: { id: string; status: string } }>({
    method: "PUT",
    path: `/v2/transactions/${id}`,
    body: { status },
  });

  printResult("Sandbox transaction updated", data.transaction);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
