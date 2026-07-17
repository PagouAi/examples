import { PagouHttpClient } from "../../src/lib/http.js";
import { idempotencyKey, printResult } from "../../src/lib/format.js";
import { ConflictError } from "../../src/lib/errors.js";
import { CANCELABLE_TRANSFER_STATUSES, type CreateTransferInput, type Transfer } from "../../src/lib/types.js";

// Pix Out lifecycle with the raw client: create → retrieve/reconcile → cancel.
// The final state (paid / rejected) arrives via the transfer webhook family;
// reconcile with GET when you need certainty. Note `amount` is a numeric cents
// value on input but a decimal string on responses.
// Run: npm run transfers:demo
async function main(): Promise<void> {
  const client = new PagouHttpClient();

  const input: CreateTransferInput = {
    pix_key_type: "EMAIL",
    pix_key_value: "supplier@example.com",
    amount: 5000, // R$50.00 in cents (minimum is 1000)
    description: "Supplier payout",
    external_ref: `payout_${Date.now()}`,
  };

  const { data: created } = await client.requestData<Transfer>({
    method: "POST",
    path: "/v2/transfers",
    body: input,
    idempotencyKey: idempotencyKey("transfer", input.external_ref!),
  });
  console.log(`Transfer ${created.id} — ${created.status} — amount(cents)=${created.amount}`);

  // Reconcile: re-read the current state before acting on it.
  const { data: current } = await client.requestData<Transfer>({
    method: "GET",
    path: `/v2/transfers/${created.id}`,
  });
  printResult("Current state", { id: current.id, status: current.status, fee: current.fee });

  if (!CANCELABLE_TRANSFER_STATUSES.has(current.status)) {
    console.log(`Status ${current.status} is not cancelable; the final state will arrive by webhook.`);
    return;
  }

  try {
    const { data: canceled } = await client.requestData<Transfer>({
      method: "POST",
      path: `/v2/transfers/${created.id}/cancel`,
      body: { reason: "wrong recipient" },
    });
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
