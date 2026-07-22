package ai.pagou.examples.webhooks;

import ai.pagou.examples.lib.Errors.NotFoundException;
import ai.pagou.examples.lib.Logger;
import ai.pagou.examples.lib.PagouHttpClient;
import ai.pagou.examples.lib.Request;
import ai.pagou.examples.webhooks.WebhookHandlers.Family;
import ai.pagou.examples.webhooks.WebhookHandlers.WebhookEvent;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;

// The offloaded, slow half of webhook handling. It runs AFTER the fast 2xx ack.
// Business state changes only on a confirmed event, and only after reconciling
// against the API — the webhook body is a hint, the API is the source of truth.
public final class WebhookProcessor {

  private static final Map<Family, String> RESOURCE_PATH =
      Map.of(
          Family.TRANSACTION, "/v2/transactions",
          Family.SUBSCRIPTION, "/v2/subscriptions",
          Family.TRANSFER, "/v2/transfers");

  private WebhookProcessor() {}

  public static void processEvent(WebhookEvent event, PagouHttpClient client) {
    if (!WebhookHandlers.isConfirmedStateChange(event.eventType())) {
      Logger.info("Ignoring non-confirming event " + event.eventType() + " (" + event.id() + ")");
      return;
    }
    if (event.resourceId() == null || event.resourceId().isEmpty()) {
      Logger.warn("Confirmed event " + event.eventType() + " without a resource id — cannot reconcile.");
      return;
    }

    try {
      JsonNode data =
          client
              .requestData(Request.get(RESOURCE_PATH.get(event.family()) + "/" + event.resourceId()), JsonNode.class)
              .data();
      String status = data != null && data.hasNonNull("status") ? data.get("status").asText() : "unknown";
      WebhookStore.setResourceState(event.resourceId(), status);
      Logger.info("Reconciled " + event.family() + " " + event.resourceId() + " → " + status);
    } catch (NotFoundException e) {
      Logger.warn("Resource " + event.resourceId() + " not found during reconciliation.");
    } catch (RuntimeException e) {
      // Reconciliation failed after the ack: a real system would requeue this
      // event for a later retry rather than replaying side effects.
      Logger.error("Reconciliation failed for " + event.id(), Map.of("message", String.valueOf(e.getMessage())));
      throw e;
    }
  }
}
