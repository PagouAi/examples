using System.Text.Json.Nodes;

namespace Pagou.Examples.Core.Webhooks;

/// <summary>
/// Parsing for the three webhook envelope families. The public contract exposes
/// no signature header, so authenticity is established downstream by reconciling
/// against the API — never by trusting these bodies. Every family carries a
/// top-level `id` that is THE dedupe key (a resource emits many events over
/// time, so deduping by resource id would drop distinct events).
/// </summary>
public static class WebhookParser
{
    /// <summary>
    /// Routes a raw webhook body to one of the three families and extracts the
    /// dedupe id, event type and resource id. Returns a typed failure instead of
    /// throwing so the server can answer with the documented error body.
    /// </summary>
    public static WebhookParseResult Parse(JsonNode? body)
    {
        if (body is not JsonObject envelope)
        {
            return WebhookParseResult.Fail("unknown_envelope");
        }

        var id = GetString(envelope, "id");
        if (id is null)
        {
            return WebhookParseResult.Fail("missing_event_id");
        }

        var eventKind = GetString(envelope, "event");

        // Transactions: envelope `event = "transaction"`, name in `data.event_type`.
        if (eventKind == "transaction")
        {
            var data = envelope["data"] as JsonObject;
            return WebhookParseResult.Ok(new WebhookEvent(
                id, WebhookFamily.Transaction,
                GetString(data, "event_type") ?? "transaction.unknown",
                GetString(data, "id") ?? "", body));
        }

        // Subscriptions: envelope `event = "subscription"`, name in `data.event_type`.
        if (eventKind == "subscription")
        {
            var data = envelope["data"] as JsonObject;
            return WebhookParseResult.Ok(new WebhookEvent(
                id, WebhookFamily.Subscription,
                GetString(data, "event_type") ?? "subscription.unknown",
                GetString(data, "id") ?? "", body));
        }

        // Transfers: top-level `type`, resource in `data.object`.
        var type = GetString(envelope, "type");
        if (type is not null)
        {
            var data = envelope["data"] as JsonObject;
            var obj = data?["object"] as JsonObject;
            return WebhookParseResult.Ok(new WebhookEvent(
                id, WebhookFamily.Transfer, type, GetString(obj, "id") ?? "", body));
        }

        return WebhookParseResult.Fail("unknown_envelope");
    }

    /// <summary>Event types that assert a confirmed, fulfillable state change.</summary>
    private static readonly HashSet<string> ConfirmedEvents = new()
    {
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
        "payout.canceled",
    };

    /// <summary>Whether an event should trigger reconciliation + a business-state change.</summary>
    public static bool IsConfirmedStateChange(string eventType) => ConfirmedEvents.Contains(eventType);

    private static string? GetString(JsonObject? obj, string key) =>
        obj is not null && obj.TryGetPropertyValue(key, out var node) && node is JsonValue value &&
        value.TryGetValue<string>(out var s)
            ? s
            : null;
}
