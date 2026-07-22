package ai.pagou.examples.checkoutlinks;

import ai.pagou.examples.lib.Format;
import ai.pagou.examples.lib.Models.CheckoutLinkProduct;
import ai.pagou.examples.lib.Models.CreateCheckoutLinkInput;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.Request;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

// Creates a hosted checkout link. The v2 contract exposes only POST — the
// returned public identifier is the checkout URL itself (data.url); persist it
// to share with the buyer. There is no retrieve/list endpoint.
// Run: mvn -q compile exec:java@checkout-create
public final class CreateCheckoutLink {

  private CreateCheckoutLink() {}

  public static void main(String[] args) {
    PagouHttpClient client = new PagouHttpClient();

    CreateCheckoutLinkInput input =
        new CreateCheckoutLinkInput(
            null,
            "BRL",
            "Pro Plan",
            List.of(new CheckoutLinkProduct("pro-plan", "Pro Plan", 4900, 1, "digital")));

    JsonNode data = client.requestData(Request.post("/v2/checkout-links").body(input), JsonNode.class).data();

    // Persist the URL — it is the only handle to the link.
    Format.printResult("Checkout link (store this URL)", data.hasNonNull("url") ? data.get("url").asText() : data);
  }
}
