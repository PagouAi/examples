package ai.pagou.examples.payments;

import ai.pagou.examples.lib.Config;
import ai.pagou.examples.lib.Format;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.Request;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;

// Sandbox-only helper: forces a transaction to a target status so you can
// exercise the paid/refunded paths without a real payer. Never available in
// production.
// Run: mvn -q compile exec:java@pay-sandbox-advance -Dexec.args="<transaction_id> [status=paid]"
public final class SandboxAdvance {

  private SandboxAdvance() {}

  public static void main(String[] args) {
    String id = Config.resourceIdFromArgs(args, "PAGOU_TRANSACTION_ID");
    String status = args.length > 1 && !args[1].isBlank() ? args[1] : "paid";
    PagouHttpClient client = new PagouHttpClient();

    JsonNode data =
        client
            .requestData(
                Request.put("/v2/transactions/" + id).body(Map.of("status", status)), JsonNode.class)
            .data();

    Format.printResult("Sandbox transaction updated", data.has("transaction") ? data.get("transaction") : data);
  }
}
