package ai.pagou.examples.subscriptions;

import ai.pagou.examples.lib.Format;
import ai.pagou.examples.lib.Models.CreateSubscriptionInput;
import ai.pagou.examples.lib.Models.Customer;
import ai.pagou.examples.lib.Models.ProductInput;
import ai.pagou.examples.lib.Models.Subscription;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.Request;
import java.util.List;
import java.util.Map;

// End-to-end subscription lifecycle with the raw client:
//   create/reuse customer → create subscription → retrieve → cancel.
// Renewal / failure / past-due / cancellation are delivered as webhooks
// (see ai.pagou.examples.webhooks); business state changes only on those
// confirmed events.
// Run: PAGOU_CARD_TOKEN=pgct_... mvn -q compile exec:java@subs-demo
public final class SubscriptionLifecycle {

  private SubscriptionLifecycle() {}

  public static void main(String[] args) {
    String token = System.getenv("PAGOU_CARD_TOKEN");
    if (token == null || token.isBlank()) {
      throw new IllegalArgumentException(
          "Set PAGOU_CARD_TOKEN to a pgct_ token from the Payment Element (subscription mode).");
    }

    PagouHttpClient client = new PagouHttpClient();

    Customer customer = Customers.createOrReuse(client);
    System.out.println("Customer " + customer.id() + " (" + customer.email() + ")");

    CreateSubscriptionInput input =
        new CreateSubscriptionInput(
            customer.id(),
            "credit_card",
            token,
            "month",
            1,
            4900,
            "BRL",
            "retry_then_cancel",
            List.of(1, 3, 7),
            List.of(new ProductInput("Pro Plan", 4900)));

    Subscription sub =
        client
            .requestData(
                Request.post("/v2/subscriptions")
                    .body(input)
                    // Idempotent create: a retry reuses the same subscription instead of a duplicate.
                    .idempotencyKey(Format.idempotencyKey("sub_create", customer.id())),
                Subscription.class)
            .data();
    System.out.println(
        "Subscription " + sub.id() + " — " + sub.status() + " — " + Format.amount(sub.amount(), sub.currency()) + "/month");

    Subscription fetched =
        client.requestData(Request.get("/v2/subscriptions/" + sub.id()), Subscription.class).data();
    Format.printResult("Billed transactions", fetched.transactions() != null ? fetched.transactions() : List.of());

    Subscription canceled =
        client
            .requestData(
                Request.post("/v2/subscriptions/" + sub.id() + "/cancel").body(Map.of("reason", "user_requested")),
                Subscription.class)
            .data();
    System.out.println(
        "Canceled " + canceled.id() + ": cancelAtPeriodEnd=" + canceled.cancelAtPeriodEnd()
            + ", canceledAt=" + canceled.canceledAt());
  }
}
