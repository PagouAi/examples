import { ConflictError } from "@pagouai/api-sdk";
import { createSdkClient } from "../../src/lib/sdk.js";
import { idempotencyKey, printResult } from "../../src/lib/format.js";
import { CANCELABLE_TRANSFER_STATUSES, type TransferStatus } from "../../src/lib/types.js";

// Same Pix Out lifecycle as ../raw/lifecycle.ts, using the SDK.
// Run: npm run transfers:demo:sdk
async function main(): Promise<void> {
  const client = createSdkClient();
  const externalRef = `payout_${Date.now()}`;

  const { data: created } = await client.transfers.create(
    {
      pix_key_type: "EMAIL",
      pix_key_value: "supplier@example.com",
      amount: 5000,
      description: "Supplier payout",
      external_ref: externalRef,
    },
    { idempotencyKey: idempotencyKey("transfer", externalRef) },
  );
  console.log(`Transfer ${created.id} — ${created.status} — amount(cents string)=${created.amount}`);

  const { data: current } = await client.transfers.retrieve(created.id);
  printResult("Current state", { id: current.id, status: current.status, fee: current.fee });

  if (!CANCELABLE_TRANSFER_STATUSES.has(current.status as TransferStatus)) {
    console.log(`Status ${current.status} is not cancelable; the final state will arrive by webhook.`);
    return;
  }

  try {
    const { data: canceled } = await client.transfers.cancel(created.id, { reason: "wrong recipient" });
    console.log(`Canceled ${canceled.id} — ${canceled.status}`);
  } catch (error) {
    if (error instanceof ConflictError) {
      console.error("Already progressed past a cancelable state — reconcile via webhook/GET.");
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
