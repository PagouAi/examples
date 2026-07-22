package ai.pagou.examples.webhooks;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

// In-memory persistence stand-ins. A real integration would back these with a
// database: the processed-events table gives idempotency across redeliveries,
// and the business-state table is the record you actually fulfill against.
public final class WebhookStore {

  private static final Map<String, Boolean> PROCESSED_EVENTS = new ConcurrentHashMap<>();
  private static final Map<String, String> BUSINESS_STATE = new ConcurrentHashMap<>();

  private WebhookStore() {}

  /** True the first time an event id is seen; false for any redelivery. */
  public static boolean markProcessed(String eventId) {
    return PROCESSED_EVENTS.putIfAbsent(eventId, Boolean.TRUE) == null;
  }

  public static boolean hasProcessed(String eventId) {
    return PROCESSED_EVENTS.containsKey(eventId);
  }

  /** Records the reconciled state of a resource (the fulfillable source of truth). */
  public static void setResourceState(String resourceId, String state) {
    BUSINESS_STATE.put(resourceId, state);
  }

  public static Optional<String> getResourceState(String resourceId) {
    return Optional.ofNullable(BUSINESS_STATE.get(resourceId));
  }

  /** Test/support helper to reset the in-memory stores. */
  public static void reset() {
    PROCESSED_EVENTS.clear();
    BUSINESS_STATE.clear();
  }
}
