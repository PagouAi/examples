import { PagouHttpClient } from "../../src/lib/http.js";
import { formatAmount, printResult } from "../../src/lib/format.js";
import type { CreateTransactionInput, Transaction } from "../../src/lib/types.js";
import { demoBuyer, demoProducts } from "../demo-data.js";

// Backend half of the card flow. The `pgct_*` token is produced in the browser
// by the Payment Element (see ../card-element) and posted to your server; it is
// the ONLY card credential your backend ever sees — never a PAN or CVV.
// Run: PAGOU_CARD_TOKEN=pgct_... npm run pay:card  (or pass the token as arg 1)
async function main(): Promise<void> {
  const token = process.argv[2] ?? process.env.PAGOU_CARD_TOKEN;
  if (!token) {
    throw new Error(
      "Provide a pgct_ token from the Payment Element (arg 1 or PAGOU_CARD_TOKEN). " +
        "Start the browser demo with: npm run pay:card:server",
    );
  }

  const client = new PagouHttpClient();
  const input: CreateTransactionInput = {
    amount: 4900,
    method: "credit_card",
    currency: "BRL",
    token,
    installments: 1,
    buyer: demoBuyer,
    products: demoProducts,
    external_ref: `card_${Date.now()}`,
  };

  const { data: tx } = await client.requestData<Transaction>({
    method: "POST",
    path: "/v2/transactions",
    body: input,
  });

  console.log(`Created ${tx.id} — ${tx.status} — ${formatAmount(tx.amount, tx.currency)}`);

  if (tx.status === "three_ds_required" && tx.next_action) {
    // 3DS: return `next_action` to the browser so the Payment Element can open
    // the challenge. Do NOT fulfill here — wait for the confirmed webhook.
    printResult("next_action (return to the browser to continue 3DS)", tx.next_action);
    return;
  }

  console.log("No 3DS challenge required. Confirm the final state via webhook or reconciliation.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
