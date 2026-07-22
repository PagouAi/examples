package ai.pagou.examples.payments;

import ai.pagou.examples.lib.Config;
import ai.pagou.examples.lib.Reconcile;
import ai.pagou.examples.lib.Reconcile.Reconciliation;

// Reconciles a transaction against the API and prints the fulfillment decision.
// This is the safe pattern behind every webhook: trust the API, not the event.
// Run: mvn -q compile exec:java@pay-reconcile -Dexec.args="<transaction_id>"
public final class ReconcileCli {

  private ReconcileCli() {}

  public static void main(String[] args) {
    String id = Config.resourceIdFromArgs(args, "PAGOU_TRANSACTION_ID");
    Reconciliation result = Reconcile.reconcileTransaction(id);

    if (result == null) {
      System.err.println("No transaction " + id + ".");
      return;
    }

    System.out.println(
        "Transaction " + result.transaction().id() + " is " + result.transaction().status()
            + " → decision: " + result.decision());
    switch (result.decision()) {
      case FULFILL -> System.out.println("Safe to deliver: the charge is settled.");
      case WAIT -> System.out.println("Not settled yet: keep the order pending and reconcile again later.");
      case CANCEL -> System.out.println("Failed/expired: release the order.");
    }
  }
}
