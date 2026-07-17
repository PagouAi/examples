import { reconcileTransaction } from "../../src/lib/reconcile.js";
import { resourceIdFromArgs } from "../demo-data.js";

// Reconciles a transaction against the API and prints the fulfillment decision.
// This is the safe pattern behind every webhook: trust the API, not the event.
// Run: npm run pay:reconcile -- <transaction_id>
async function main(): Promise<void> {
  const id = resourceIdFromArgs("PAGOU_TRANSACTION_ID");
  const result = await reconcileTransaction(id);

  if (!result) {
    console.error(`No transaction ${id}.`);
    return;
  }

  const { transaction, decision } = result;
  console.log(`Transaction ${transaction.id} is ${transaction.status} → decision: ${decision}`);
  if (decision === "fulfill") {
    console.log("Safe to deliver: the charge is settled.");
  } else if (decision === "wait") {
    console.log("Not settled yet: keep the order pending and reconcile again later.");
  } else {
    console.log("Failed/expired: release the order.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
