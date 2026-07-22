package ai.pagou.examples.payments;

import ai.pagou.examples.lib.Format;
import ai.pagou.examples.lib.Models.CreateTransactionInput;
import ai.pagou.examples.lib.Models.Transaction;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.Request;

// Creates a voucher (boleto) charge. The printable instructions arrive
// asynchronously: the create response may return status: pending with the
// voucher block populated once the instrument is issued. Reconcile with a GET
// or a webhook to obtain the final barcode / digitable line / PDF URL.
// Run: mvn -q compile exec:java@pay-voucher
public final class CreateVoucher {

  private CreateVoucher() {}

  public static void main(String[] args) {
    PagouHttpClient client = new PagouHttpClient();

    CreateTransactionInput input =
        new CreateTransactionInput(
            4900,
            "voucher",
            "BRL",
            DemoData.DEMO_BUYER,
            DemoData.DEMO_PRODUCTS,
            "voucher_" + System.currentTimeMillis(),
            null,
            null,
            null);

    Transaction tx =
        client.requestData(Request.post("/v2/transactions").body(input), Transaction.class).data();

    System.out.println(
        "Created " + tx.id() + " — " + tx.status() + " — " + Format.amount(tx.amount(), tx.currency()));
    boolean ready = tx.voucher() != null && (tx.voucher().barcode() != null || tx.voucher().url() != null);
    if (ready) {
      Format.printResult("Voucher instructions", tx.voucher());
    } else {
      System.out.println(
          "Instructions not ready yet — reconcile " + tx.id() + " via GET or wait for the webhook.");
    }
  }
}
