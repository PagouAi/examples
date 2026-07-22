package ai.pagou.examples.payments;

import ai.pagou.examples.lib.Models.Buyer;
import ai.pagou.examples.lib.Models.Document;
import ai.pagou.examples.lib.Models.ProductInput;
import java.util.List;

/** Synthetic buyer data — safe to commit. Never use real documents or PII. */
public final class DemoData {

  private DemoData() {}

  public static final Buyer DEMO_BUYER =
      new Buyer("Ana Souza", "ana.souza@example.com", new Document("CPF", "19100000000"));

  public static final List<ProductInput> DEMO_PRODUCTS = List.of(new ProductInput("Pro Plan", 4900, 1));
}
