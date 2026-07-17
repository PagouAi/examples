import { NotFoundError } from "@pagouai/api-sdk";
import { createSdkClient } from "../../src/lib/sdk.js";
import { printResult } from "../../src/lib/format.js";
import { resourceIdFromArgs } from "../demo-data.js";

// Retrieve a transaction with the SDK. Run: npm run pay:retrieve:sdk -- <id>
async function main(): Promise<void> {
  const id = resourceIdFromArgs("PAGOU_TRANSACTION_ID");
  const client = createSdkClient();

  try {
    const { data, meta } = await client.transactions.retrieve(id);
    printResult("Transaction", data);
    console.log(`Correlation id: ${meta.requestId}`);
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
