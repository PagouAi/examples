package ai.pagou.examples.subscriptions;

import ai.pagou.examples.lib.Models.CreateCustomerInput;
import ai.pagou.examples.lib.Models.Customer;
import ai.pagou.examples.lib.Models.Document;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.Request;

// Customers are not a separate product surface here; both the raw subscription
// example reuses this helper to create or reuse a customer through the client.
public final class Customers {

  private Customers() {}

  /** Reuses PAGOU_CUSTOMER_ID when set, otherwise creates a fresh customer. */
  public static Customer createOrReuse(PagouHttpClient client) {
    String existing = System.getenv("PAGOU_CUSTOMER_ID");
    if (existing != null && !existing.isBlank()) {
      return client.requestData(Request.get("/v2/customers/" + existing), Customer.class).data();
    }

    long stamp = System.currentTimeMillis();
    CreateCustomerInput input =
        new CreateCustomerInput(
            "Ana Souza",
            "ana.souza+" + stamp + "@example.com",
            new Document("CPF", "19100000000"),
            "11999990000",
            "cust_" + stamp);

    return client.requestData(Request.post("/v2/customers").body(input), Customer.class).data();
  }
}
