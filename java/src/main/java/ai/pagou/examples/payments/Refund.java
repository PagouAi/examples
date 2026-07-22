package ai.pagou.examples.payments;

import ai.pagou.examples.lib.Config;
import ai.pagou.examples.lib.Errors.InvalidRequestException;
import ai.pagou.examples.lib.Format;
import ai.pagou.examples.lib.Models.RefundResult;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.Request;
import java.util.LinkedHashMap;
import java.util.Map;

// Refunds a transaction. Omit the amount for a full refund; pass cents for a
// partial one. The refund is idempotent via an Idempotency-Key so a retry after
// a network blip never double-refunds.
// Run: mvn -q compile exec:java@pay-refund -Dexec.args="<transaction_id> [amount_cents]"
public final class Refund {

  private Refund() {}

  public static void main(String[] args) {
    String id = Config.resourceIdFromArgs(args, "PAGOU_TRANSACTION_ID");
    Long amount = args.length > 1 && !args[1].isBlank() ? Long.parseLong(args[1]) : null;
    PagouHttpClient client = new PagouHttpClient();

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("reason", "requested_by_customer");
    if (amount != null) {
      body.put("amount", amount);
    }

    try {
      RefundResult refund =
          client
              .requestData(
                  Request.put("/v2/transactions/" + id + "/refund")
                      .body(body)
                      .idempotencyKey(Format.idempotencyKey("refund", id + "_" + (amount == null ? "full" : amount))),
                  RefundResult.class)
              .data();

      System.out.println(refund.isFullRefund() ? "Full refund processed." : "Partial refund processed.");
      Map<String, Object> view = new LinkedHashMap<>();
      view.put("amount_refunded", Format.amount(refund.amountRefunded()));
      view.put("remaining_balance", Format.amount(refund.remainingBalance()));
      Format.printResult("Refund", view);
    } catch (InvalidRequestException e) {
      System.err.println("Refund rejected: " + e.getMessage());
    }
  }
}
