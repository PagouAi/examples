import { PagouHttpClient } from "../../src/lib/http.js";
import { createSdkClient } from "../../src/lib/sdk.js";
import { formatAmount, idempotencyKey, printResult } from "../../src/lib/format.js";
import { createOrReuseCustomer } from "../customers.js";

// Same lifecycle as ../raw/lifecycle.ts. The customer is created with the raw
// client (no SDK resource); the subscription itself uses the SDK.
// Run: PAGOU_CARD_TOKEN=pgct_... npm run subs:demo:sdk
async function main(): Promise<void> {
  const token = process.env.PAGOU_CARD_TOKEN;
  if (!token) {
    throw new Error("Set PAGOU_CARD_TOKEN to a pgct_ token from the Payment Element (subscription mode).");
  }

  const raw = new PagouHttpClient();
  const sdk = createSdkClient();

  const customer = await createOrReuseCustomer(raw);
  console.log(`Customer ${customer.id} (${customer.email})`);

  const { data: sub } = await sdk.subscriptions.create(
    {
      customer_id: customer.id,
      token,
      interval: "month",
      interval_count: 1,
      amount: 4900,
      currency: "BRL",
      failure_policy: "retry_then_cancel",
      retry_offsets_days: [1, 3, 7],
      products: [{ name: "Pro Plan", price: 4900 }],
    },
    { idempotencyKey: idempotencyKey("sub_create", customer.id) },
  );
  console.log(`Subscription ${sub.id} — ${sub.status} — ${formatAmount(sub.amount, sub.currency)}/month`);

  const { data: fetched } = await sdk.subscriptions.retrieve(sub.id);
  printResult("Billed transactions", fetched.transactions ?? []);

  const { data: canceled } = await sdk.subscriptions.cancel(sub.id, { reason: "user_requested" });
  console.log(`Canceled ${canceled.id}: cancelAtPeriodEnd=${canceled.cancelAtPeriodEnd}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
