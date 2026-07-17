import { PagouHttpClient } from "../../src/lib/http.js";
import { printResult } from "../../src/lib/format.js";
import type { CreateCheckoutLinkInput } from "../../src/lib/types.js";

// Creates a hosted checkout link. The v2 contract exposes only POST — the
// returned public identifier is the checkout URL itself (`data.url`); persist
// it to share with the buyer. There is no retrieve/list endpoint.
// Run: npm run checkout:create
async function main(): Promise<void> {
  const client = new PagouHttpClient();

  const input: CreateCheckoutLinkInput = {
    title: "Pro Plan",
    currency: "BRL",
    products: [
      { external_id: "pro-plan", name: "Pro Plan", price: 4900, quantity: 1, type: "digital" },
    ],
  };

  const { data } = await client.requestData<{ url: string }>({
    method: "POST",
    path: "/v2/checkout-links",
    body: input,
  });

  // Persist the URL — it is the only handle to the link.
  printResult("Checkout link (store this URL)", data.url);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
