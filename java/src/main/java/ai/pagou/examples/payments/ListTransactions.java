package ai.pagou.examples.payments;

import ai.pagou.examples.lib.Models.TransactionListItem;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.PagouHttpClient.CursorPage;
import ai.pagou.examples.lib.Request;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Lists transactions with cursor pagination. Filters use camelCase query names
// (paymentMethods), while the envelope cursors are snake_case
// (next_cursor / prev_cursor). Walks up to three pages forward.
// Run: mvn -q compile exec:java@pay-list
public final class ListTransactions {

  private ListTransactions() {}

  public static void main(String[] args) {
    PagouHttpClient client = new PagouHttpClient();
    String cursor = null;

    for (int pageNum = 1; pageNum <= 3; pageNum++) {
      Map<String, Object> query = new LinkedHashMap<>();
      query.put("limit", 5);
      query.put("paymentMethods", List.of("pix", "credit_card"));
      if (cursor != null) {
        query.put("cursor", cursor);
        query.put("direction", "next");
      }

      CursorPage<TransactionListItem> page =
          client.requestCursorPage(Request.get("/v2/transactions").query(query), TransactionListItem.class).data();

      System.out.println("\nPage " + pageNum + " — " + page.data().size() + " of " + page.total() + " total");
      for (TransactionListItem item : page.data()) {
        System.out.println(
            "  " + item.id() + "  " + pad(item.status()) + "  " + item.payment().method() + "  " + item.payment().amount());
      }

      if (page.nextCursor() == null) {
        System.out.println("\nNo more pages.");
        break;
      }
      cursor = page.nextCursor();
    }
  }

  private static String pad(String status) {
    return String.format("%-18s", status == null ? "" : status);
  }
}
