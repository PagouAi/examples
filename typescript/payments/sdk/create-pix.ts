import { ConflictError } from "@pagouai/api-sdk";
import { createSdkClient } from "../../src/lib/sdk.js";
import { formatAmount, printResult } from "../../src/lib/format.js";
import type { Transaction } from "../../src/lib/types.js";
import { demoBuyer, demoProducts } from "../demo-data.js";

// Same Pix charge as ../raw/create-pix.ts, using the official SDK.
// Run: npm run pay:pix:sdk
async function main(): Promise<void> {
  const client = createSdkClient();

  try {
    const { data } = await client.transactions.create({
      amount: 4900,
      method: "pix",
      currency: "BRL",
      buyer: demoBuyer,
      products: demoProducts,
      external_ref: `order_${Date.now()}`,
    });
    const tx = data as unknown as Transaction;

    console.log(`Created ${tx.id} — ${tx.status} — ${formatAmount(tx.amount, tx.currency)}`);
    printResult("Pix QR (copy and paste)", tx.pix?.qr_code);
  } catch (error) {
    if (error instanceof ConflictError) {
      console.error("Duplicate external_ref — this charge was already created.");
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
