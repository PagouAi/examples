package ai.pagou.examples;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import ai.pagou.examples.lib.Config;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.PagouHttpClient.Exchange;
import ai.pagou.examples.lib.PagouHttpClient.RawResponse;
import ai.pagou.examples.lib.Reconcile;
import ai.pagou.examples.lib.Reconcile.Decision;
import ai.pagou.examples.lib.Reconcile.Reconciliation;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ReconcileTest {

  private static final Config CONFIG =
      Config.of(Config.Environment.SANDBOX, "https://api.sandbox.pagou.ai", "test", 1000, 0);

  private static Exchange respond(int status, String body) {
    return (request, timeout) -> new RawResponse(status, Map.of("content-type", "application/json"), body);
  }

  @Test
  void fulfillsOnlyOnSettledStatuses() {
    assertEquals(Decision.FULFILL, Reconcile.decideFulfillment("paid"));
    assertEquals(Decision.FULFILL, Reconcile.decideFulfillment("captured"));
  }

  @Test
  void waitsOnNonTerminalStatuses() {
    assertEquals(Decision.WAIT, Reconcile.decideFulfillment("pending"));
    assertEquals(Decision.WAIT, Reconcile.decideFulfillment("three_ds_required"));
    assertEquals(Decision.WAIT, Reconcile.decideFulfillment("processing"));
  }

  @Test
  void cancelsOnTerminalFailures() {
    assertEquals(Decision.CANCEL, Reconcile.decideFulfillment("expired"));
    assertEquals(Decision.CANCEL, Reconcile.decideFulfillment("refused"));
    assertEquals(Decision.CANCEL, Reconcile.decideFulfillment("canceled"));
  }

  @Test
  void fetchesTransactionAndReturnsDecision() {
    PagouHttpClient client =
        new PagouHttpClient(CONFIG, respond(200, "{\"success\":true,\"requestId\":\"r\",\"data\":{\"id\":\"tx_1\",\"status\":\"paid\"}}"));
    Reconciliation result = Reconcile.reconcileTransaction("tx_1", client);
    assertEquals(Decision.FULFILL, result.decision());
    assertEquals("paid", result.transaction().status());
  }

  @Test
  void returnsNullWhenTransactionMissing() {
    PagouHttpClient client = new PagouHttpClient(CONFIG, respond(404, "{\"message\":\"not found\"}"));
    assertNull(Reconcile.reconcileTransaction("missing", client));
  }
}
