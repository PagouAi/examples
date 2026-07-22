package ai.pagou.examples.payments;

import ai.pagou.examples.lib.Errors.ConflictException;
import ai.pagou.examples.lib.Format;
import ai.pagou.examples.lib.Models.CreateTransactionInput;
import ai.pagou.examples.lib.Models.Transaction;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.Request;

// Creates a Pix charge and returns the copy-and-paste QR payload (pix.qr_code).
// Run: mvn -q compile exec:java@pay-pix
public final class CreatePix {

  private CreatePix() {}

  public static void main(String[] args) {
    PagouHttpClient client = new PagouHttpClient();

    CreateTransactionInput input =
        new CreateTransactionInput(
            4900,
            "pix",
            "BRL",
            DemoData.DEMO_BUYER,
            DemoData.DEMO_PRODUCTS,
            // external_ref doubles as a natural idempotency key: a duplicate value
            // is rejected with 409 DUPLICATE_EXTERNAL_REF instead of double-charging.
            "order_" + System.currentTimeMillis(),
            null,
            null,
            null);

    try {
      Transaction tx =
          client.requestData(Request.post("/v2/transactions").body(input), Transaction.class).data();

      System.out.println(
          "Created " + tx.id() + " — " + tx.status() + " — " + Format.amount(tx.amount(), tx.currency()));
      Format.printResult("Pix QR (copy and paste)", tx.pix() != null ? tx.pix().qrCode() : null);
      Format.printResult("Expires at", tx.pix() != null ? tx.pix().expirationDate() : null);
    } catch (ConflictException e) {
      System.err.println("Duplicate external_ref — this charge was already created.");
    }
  }
}
