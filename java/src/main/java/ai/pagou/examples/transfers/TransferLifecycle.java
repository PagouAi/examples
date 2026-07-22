package ai.pagou.examples.transfers;

import ai.pagou.examples.lib.Errors.ConflictException;
import ai.pagou.examples.lib.Format;
import ai.pagou.examples.lib.Models;
import ai.pagou.examples.lib.Models.CreateTransferInput;
import ai.pagou.examples.lib.Models.Transfer;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.Request;
import java.util.LinkedHashMap;
import java.util.Map;

// Pix Out lifecycle with the raw client: create → retrieve/reconcile → cancel.
// The final state (paid / rejected) arrives via the transfer webhook family;
// reconcile with GET when you need certainty. Note amount is a numeric cents
// value on input but a decimal string on responses.
// Run: mvn -q compile exec:java@transfers-demo
public final class TransferLifecycle {

  private TransferLifecycle() {}

  public static void main(String[] args) {
    PagouHttpClient client = new PagouHttpClient();

    String externalRef = "payout_" + System.currentTimeMillis();
    CreateTransferInput input =
        new CreateTransferInput(
            "EMAIL",
            "supplier@example.com",
            5000, // R$50.00 in cents (minimum is 1000)
            "Supplier payout",
            externalRef);

    Transfer created =
        client
            .requestData(
                Request.post("/v2/transfers").body(input).idempotencyKey(Format.idempotencyKey("transfer", externalRef)),
                Transfer.class)
            .data();
    System.out.println("Transfer " + created.id() + " — " + created.status() + " — amount(cents)=" + created.amount());

    // Reconcile: re-read the current state before acting on it.
    Transfer current =
        client.requestData(Request.get("/v2/transfers/" + created.id()), Transfer.class).data();
    Map<String, Object> view = new LinkedHashMap<>();
    view.put("id", current.id());
    view.put("status", current.status());
    view.put("fee", current.fee());
    Format.printResult("Current state", view);

    if (!Models.CANCELABLE_TRANSFER_STATUSES.contains(current.status())) {
      System.out.println("Status " + current.status() + " is not cancelable; the final state will arrive by webhook.");
      return;
    }

    try {
      Transfer canceled =
          client
              .requestData(
                  Request.post("/v2/transfers/" + created.id() + "/cancel").body(Map.of("reason", "wrong recipient")),
                  Transfer.class)
              .data();
      System.out.println("Canceled " + canceled.id() + " — " + canceled.status());
    } catch (ConflictException e) {
      System.err.println("Already progressed past a cancelable state — reconcile via webhook/GET.");
    }
  }
}
