import { PagouHttpClient } from "../../src/lib/http.js";
import { formatAmount, idempotencyKey, printResult } from "../../src/lib/format.js";
import type { CreateSubscriptionInput, Subscription } from "../../src/lib/types.js";
import { createOrReuseCustomer } from "../customers.js";

// End-to-end subscription lifecycle with the raw client:
//   create/reuse customer → create subscription → retrieve → cancel.
// Renewal / failure / past-due / cancellation are delivered as webhooks
// (see ../../webhooks); business state changes only on those confirmed events.
// Run: PAGOU_CARD_TOKEN=pgct_... npm run subs:demo
async function main(): Promise<void> {
  const token = process.env.PAGOU_CARD_TOKEN;
  if (!token) {
    throw new Error("Set PAGOU_CARD_TOKEN to a pgct_ token from the Payment Element (subscription mode).");
  }

  const client = new PagouHttpClient();

  const customer = await createOrReuseCustomer(client);
  console.log(`Customer ${customer.id} (${customer.email})`);

  const input: CreateSubscriptionInput = {
    customer_id: customer.id,
    payment_method: "credit_card",
    token,
    interval: "month",
    interval_count: 1,
    amount: 4900,
    currency: "BRL",
    failure_policy: "retry_then_cancel",
    retry_offsets_days: [1, 3, 7],
    products: [{ name: "Pro Plan", price: 4900 }],
  };

  const { data: sub } = await client.requestData<Subscription>({
    method: "POST",
    path: "/v2/subscriptions",
    body: input,
    // Idempotent create: a retry reuses the same subscription instead of a duplicate.
    idempotencyKey: idempotencyKey("sub_create", customer.id),
  });
  console.log(`Subscription ${sub.id} — ${sub.status} — ${formatAmount(sub.amount, sub.currency)}/month`);

  const { data: fetched } = await client.requestData<Subscription>({
    method: "GET",
    path: `/v2/subscriptions/${sub.id}`,
  });
  printResult("Billed transactions", fetched.transactions ?? []);

  const { data: canceled } = await client.requestData<Subscription>({
    method: "POST",
    path: `/v2/subscriptions/${sub.id}/cancel`,
    body: { reason: "user_requested" },
  });
  console.log(
    `Canceled ${canceled.id}: cancelAtPeriodEnd=${canceled.cancelAtPeriodEnd}, canceledAt=${canceled.canceledAt}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
