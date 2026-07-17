import { createSdkClient } from "../../src/lib/sdk.js";

// Cursor pagination with the SDK, including its auto-paging iterator.
// Run: npm run pay:list:sdk
async function main(): Promise<void> {
  const client = createSdkClient();

  // Explicit cursor navigation.
  const first = await client.transactions.list({ limit: 5, paymentMethods: ["pix"] });
  console.log(`First page: ${first.data.data.length} of ${first.data.total}`);

  if (first.data.next_cursor) {
    const next = await client.transactions.list({
      cursor: first.data.next_cursor,
      direction: "next",
      limit: 5,
      paymentMethods: ["pix"],
    });
    console.log(`Next page: ${next.data.data.length}`);
  }

  // Auto-paging: iterate every transaction without managing cursors by hand.
  let count = 0;
  for await (const item of client.transactions.listAutoPagingIterator({ limit: 50 })) {
    count++;
    if (count >= 20) break;
  }
  console.log(`Auto-paged over ${count} transactions.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
