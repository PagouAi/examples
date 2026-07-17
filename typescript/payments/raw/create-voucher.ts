import { PagouHttpClient } from "../../src/lib/http.js";
import { formatAmount, printResult } from "../../src/lib/format.js";
import type { CreateTransactionInput, Transaction } from "../../src/lib/types.js";
import { demoBuyer, demoProducts } from "../demo-data.js";

// Creates a voucher (boleto) charge. The printable instructions arrive
// asynchronously: the create response may return `status: pending` with the
// `voucher` block populated once the instrument is issued. Reconcile with a
// GET or a webhook to obtain the final barcode / digitable line / PDF URL.
// Run: npm run pay:voucher
async function main(): Promise<void> {
  const client = new PagouHttpClient();

  const input: CreateTransactionInput = {
    amount: 4900,
    method: "voucher",
    currency: "BRL",
    buyer: demoBuyer,
    products: demoProducts,
    external_ref: `voucher_${Date.now()}`,
  };

  const { data: tx } = await client.requestData<Transaction>({
    method: "POST",
    path: "/v2/transactions",
    body: input,
  });

  console.log(`Created ${tx.id} — ${tx.status} — ${formatAmount(tx.amount, tx.currency)}`);
  if (tx.voucher?.barcode ?? tx.voucher?.url) {
    printResult("Voucher instructions", tx.voucher);
  } else {
    console.log(`Instructions not ready yet — reconcile ${tx.id} via GET or wait for the webhook.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
