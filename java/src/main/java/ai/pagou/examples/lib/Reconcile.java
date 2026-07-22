package ai.pagou.examples.lib;

import ai.pagou.examples.lib.Models.Transaction;
import java.util.Set;

/**
 * Server-side reconciliation: fetch the transaction from the API (the source of
 * truth) and decide whether to fulfill. Business state changes only on this
 * confirmed result, never on an unverified webhook body.
 */
public final class Reconcile {

  public enum Decision {
    FULFILL,
    WAIT,
    CANCEL
  }

  // Terminal failure/cancel states: stop waiting, release the order.
  private static final Set<String> TERMINAL_FAILED = Set.of("canceled", "expired", "refused");

  private Reconcile() {}

  /** Maps a transaction status to a business decision. Never fulfill on a pending state. */
  public static Decision decideFulfillment(String status) {
    if (Models.TERMINAL_PAID_STATUSES.contains(status)) {
      return Decision.FULFILL;
    }
    if (TERMINAL_FAILED.contains(status)) {
      return Decision.CANCEL;
    }
    return Decision.WAIT;
  }

  public record Reconciliation(Transaction transaction, Decision decision) {}

  /** Fetches the transaction and returns a fulfillment decision, or null if it does not exist. */
  public static Reconciliation reconcileTransaction(String id, PagouHttpClient client) {
    try {
      PagouHttpClient.Result<Transaction> result =
          client.requestData(Request.get("/v2/transactions/" + id), Transaction.class);
      Transaction tx = result.data();
      return new Reconciliation(tx, decideFulfillment(tx.status()));
    } catch (Errors.NotFoundException e) {
      return null;
    }
  }

  public static Reconciliation reconcileTransaction(String id) {
    return reconcileTransaction(id, new PagouHttpClient());
  }
}
