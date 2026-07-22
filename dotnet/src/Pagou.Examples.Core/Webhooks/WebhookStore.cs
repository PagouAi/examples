namespace Pagou.Examples.Core.Webhooks;

/// <summary>
/// In-memory persistence stand-ins. A real integration would back these with a
/// database: the processed-events set gives idempotency across redeliveries, and
/// the business-state map is the record you actually fulfill against.
/// </summary>
public sealed class WebhookStore
{
    private readonly HashSet<string> _processedEvents = new();
    private readonly Dictionary<string, string> _businessState = new();
    private readonly object _gate = new();

    /// <summary>True the first time an event id is seen; false for any redelivery.</summary>
    public bool MarkProcessed(string eventId)
    {
        lock (_gate)
        {
            return _processedEvents.Add(eventId);
        }
    }

    public bool HasProcessed(string eventId)
    {
        lock (_gate)
        {
            return _processedEvents.Contains(eventId);
        }
    }

    /// <summary>Records the reconciled state of a resource (the fulfillable source of truth).</summary>
    public void SetResourceState(string resourceId, string state)
    {
        lock (_gate)
        {
            _businessState[resourceId] = state;
        }
    }

    public string? GetResourceState(string resourceId)
    {
        lock (_gate)
        {
            return _businessState.TryGetValue(resourceId, out var state) ? state : null;
        }
    }
}
