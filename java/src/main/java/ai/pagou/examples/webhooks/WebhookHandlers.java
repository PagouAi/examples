package ai.pagou.examples.webhooks;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Set;

// Parsing for the three webhook envelope families. The public contract exposes
// no signature header, so authenticity is established downstream by reconciling
// against the API — never by trusting these bodies. Every family carries a
// top-level `id` that is THE dedupe key (a resource emits many events over
// time, so deduping by resource id would drop distinct events).
public final class WebhookHandlers {

  private WebhookHandlers() {}

  public enum Family {
    TRANSACTION,
    SUBSCRIPTION,
    TRANSFER
  }

  /** Success or failure of parsing a raw webhook body. */
  public sealed interface ParseResult permits WebhookEvent, ParseFailure {}

  public record WebhookEvent(String id, Family family, String eventType, String resourceId, JsonNode raw)
      implements ParseResult {}

  /** error is one of: "missing_event_id", "unknown_envelope". */
  public record ParseFailure(String error) implements ParseResult {}

  /**
   * Routes a raw webhook body to one of the three families and extracts the
   * dedupe id, event type and resource id. Returns a typed failure instead of
   * throwing so the server can answer with the documented error body.
   */
  public static ParseResult parse(JsonNode envelope) {
    if (envelope == null || !envelope.isObject()) {
      return new ParseFailure("unknown_envelope");
    }

    String id = envelope.hasNonNull("id") && envelope.get("id").isTextual() ? envelope.get("id").asText() : null;
    if (id == null) {
      return new ParseFailure("missing_event_id");
    }

    JsonNode data = envelope.get("data");

    // Transactions: envelope event = "transaction", name in data.event_type.
    if ("transaction".equals(text(envelope, "event"))) {
      return new WebhookEvent(
          id, Family.TRANSACTION, textOr(data, "event_type", "transaction.unknown"), textOr(data, "id", ""), envelope);
    }

    // Subscriptions: envelope event = "subscription", name in data.event_type.
    if ("subscription".equals(text(envelope, "event"))) {
      return new WebhookEvent(
          id, Family.SUBSCRIPTION, textOr(data, "event_type", "subscription.unknown"), textOr(data, "id", ""), envelope);
    }

    // Transfers: top-level type, resource in data.object.
    if (envelope.hasNonNull("type") && envelope.get("type").isTextual()) {
      JsonNode object = data != null ? data.get("object") : null;
      return new WebhookEvent(
          id, Family.TRANSFER, envelope.get("type").asText(), textOr(object, "id", ""), envelope);
    }

    return new ParseFailure("unknown_envelope");
  }

  /** Event types that assert a confirmed, fulfillable state change. */
  private static final Set<String> CONFIRMED_EVENTS =
      Set.of(
          "transaction.paid",
          "transaction.refunded",
          "transaction.partially_refunded",
          "transaction.chargedback",
          "subscription.renewed",
          "subscription.payment_failed",
          "subscription.past_due",
          "subscription.canceled",
          "payout.transferred",
          "payout.failed",
          "payout.rejected",
          "payout.canceled");

  /** Whether an event should trigger reconciliation + a business-state change. */
  public static boolean isConfirmedStateChange(String eventType) {
    return CONFIRMED_EVENTS.contains(eventType);
  }

  private static String text(JsonNode node, String field) {
    return node != null && node.hasNonNull(field) ? node.get(field).asText() : null;
  }

  private static String textOr(JsonNode node, String field, String fallback) {
    String value = text(node, field);
    return value != null ? value : fallback;
  }
}
