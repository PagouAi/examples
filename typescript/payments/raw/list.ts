import { PagouHttpClient } from "../../src/lib/http.js";
import type { TransactionListItem } from "../../src/lib/types.js";

// Lists transactions with cursor pagination. Filters use camelCase query names
// (`paymentMethods`), while the envelope cursors are snake_case
// (`next_cursor` / `prev_cursor`). Walks up to three pages forward.
// Run: npm run pay:list
async function main(): Promise<void> {
  const client = new PagouHttpClient();
  let cursor: string | null = null;

  for (let pageNum = 1; pageNum <= 3; pageNum++) {
    const query: Record<string, unknown> = { limit: 5, paymentMethods: ["pix", "credit_card"] };
    if (cursor) {
      query.cursor = cursor;
      query.direction = "next";
    }
    const result = await client.requestCursorPage<TransactionListItem>({ method: "GET", path: "/v2/transactions", query });
    const page = result.data;

    console.log(`\nPage ${pageNum} — ${page.data.length} of ${page.total} total`);
    for (const item of page.data) {
      console.log(`  ${item.id}  ${item.status.padEnd(18)}  ${item.payment.method}  ${item.payment.amount}`);
    }

    if (!page.next_cursor) {
      console.log("\nNo more pages.");
      break;
    }
    cursor = page.next_cursor;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
