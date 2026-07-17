import { PagouHttpClient } from "../../src/lib/http.js";
import { formatAmount, printResult } from "../../src/lib/format.js";
import { ConflictError } from "../../src/lib/errors.js";
import type { CreateTransactionInput, Transaction } from "../../src/lib/types.js";
import { demoBuyer, demoProducts } from "../demo-data.js";

// Creates a Pix charge and returns the copy-and-paste QR payload (`pix.qr_code`).
// Run: npm run pay:pix
async function main(): Promise<void> {
  const client = new PagouHttpClient();

  const input: CreateTransactionInput = {
    amount: 4900,
    method: "pix",
    currency: "BRL",
    buyer: demoBuyer,
    products: demoProducts,
    // `external_ref` doubles as a natural idempotency key: a duplicate value
    // is rejected with 409 DUPLICATE_EXTERNAL_REF instead of double-charging.
    external_ref: `order_${Date.now()}`,
  };

  try {
    const { data: tx } = await client.requestData<Transaction>({
      method: "POST",
      path: "/v2/transactions",
      body: input,
    });

    console.log(`Created ${tx.id} — ${tx.status} — ${formatAmount(tx.amount, tx.currency)}`);
    printResult("Pix QR (copy and paste)", tx.pix?.qr_code);
    printResult("Expires at", tx.pix?.expiration_date);
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
