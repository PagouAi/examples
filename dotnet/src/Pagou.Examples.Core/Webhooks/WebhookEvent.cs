using System.Text.Json.Nodes;

namespace Pagou.Examples.Core.Webhooks;

public enum WebhookFamily
{
    Transaction,
    Subscription,
    Transfer,
}

// Id is the top-level event id (the dedupe key). EventType is the concrete event
// name (e.g. transaction.paid). ResourceId is the affected resource's public id.
public sealed record WebhookEvent(
    string Id,
    WebhookFamily Family,
    string EventType,
    string ResourceId,
    JsonNode? Raw);

/// <summary>Either a parsed <see cref="WebhookEvent"/> or a typed ingestion failure.</summary>
public sealed record WebhookParseResult
{
    public WebhookEvent? Event { get; init; }

    /// <summary>"missing_event_id" | "unknown_envelope" when parsing failed.</summary>
    public string? Error { get; init; }

    public bool IsError => Error is not null;

    public static WebhookParseResult Ok(WebhookEvent evt) => new() { Event = evt };

    public static WebhookParseResult Fail(string error) => new() { Error = error };
}
