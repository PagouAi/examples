package ai.pagou.examples.payments;

import ai.pagou.examples.lib.Config;
import ai.pagou.examples.lib.Errors.NotFoundException;
import ai.pagou.examples.lib.Format;
import ai.pagou.examples.lib.Models.Transaction;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.Request;
import java.util.LinkedHashMap;
import java.util.Map;

// Retrieves a transaction by its public UUID.
// Run: mvn -q compile exec:java@pay-retrieve -Dexec.args="<transaction_id>"
public final class Retrieve {

  private Retrieve() {}

  public static void main(String[] args) {
    String id = Config.resourceIdFromArgs(args, "PAGOU_TRANSACTION_ID");
    PagouHttpClient client = new PagouHttpClient();

    try {
      Transaction tx =
          client.requestData(Request.get("/v2/transactions/" + id), Transaction.class).data();
      Map<String, Object> view = new LinkedHashMap<>();
      view.put("id", tx.id());
      view.put("status", tx.status());
      view.put("amount", tx.amount());
      view.put("paid_amount", tx.paidAmount());
      view.put("refunded_amount", tx.refundedAmount());
      view.put("paid_at", tx.paidAt());
      Format.printResult("Transaction", view);
    } catch (NotFoundException e) {
      System.err.println("No transaction " + id + ".");
    }
  }
}
