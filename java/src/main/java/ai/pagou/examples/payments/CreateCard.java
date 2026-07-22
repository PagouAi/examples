package ai.pagou.examples.payments;

import ai.pagou.examples.lib.Format;
import ai.pagou.examples.lib.Models.CreateTransactionInput;
import ai.pagou.examples.lib.Models.Transaction;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.Request;

// Backend half of the card flow. The pgct_ token is produced in the browser by
// the Payment Element (see CardElementServer) and posted to your server; it is
// the ONLY card credential your backend ever sees — never a PAN or CVV.
// Run: PAGOU_CARD_TOKEN=pgct_... mvn -q compile exec:java@pay-card
//   (or pass the token as the first argument)
public final class CreateCard {

  private CreateCard() {}

  public static void main(String[] args) {
    String token = args.length > 0 ? args[0] : System.getenv("PAGOU_CARD_TOKEN");
    if (token == null || token.isBlank()) {
      throw new IllegalArgumentException(
          "Provide a pgct_ token from the Payment Element (arg 1 or PAGOU_CARD_TOKEN). "
              + "Start the browser demo with: mvn -q compile exec:java@pay-card-server");
    }

    PagouHttpClient client = new PagouHttpClient();
    CreateTransactionInput input =
        new CreateTransactionInput(
            4900,
            "credit_card",
            "BRL",
            DemoData.DEMO_BUYER,
            DemoData.DEMO_PRODUCTS,
            "card_" + System.currentTimeMillis(),
            1,
            token,
            null);

    Transaction tx =
        client.requestData(Request.post("/v2/transactions").body(input), Transaction.class).data();

    System.out.println(
        "Created " + tx.id() + " — " + tx.status() + " — " + Format.amount(tx.amount(), tx.currency()));

    if ("three_ds_required".equals(tx.status()) && tx.nextAction() != null) {
      // 3DS: return next_action to the browser so the Payment Element can open
      // the challenge. Do NOT fulfill here — wait for the confirmed webhook.
      Format.printResult("next_action (return to the browser to continue 3DS)", tx.nextAction());
      return;
    }

    System.out.println("No 3DS challenge required. Confirm the final state via webhook or reconciliation.");
  }
}
