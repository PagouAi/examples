using System.Text.Json.Serialization;

namespace Pagou.Examples.Core.Webhooks;

/// <summary>
/// The offloaded, slow half of webhook handling. It runs AFTER the fast 2xx ack.
/// Business state changes only on a confirmed event, and only after reconciling
/// against the API — the webhook body is a hint, the API is the source of truth.
/// </summary>
public sealed class WebhookProcessor
{
    private static readonly Dictionary<WebhookFamily, string> ResourcePath = new()
    {
        [WebhookFamily.Transaction] = "/v2/transactions",
        [WebhookFamily.Subscription] = "/v2/subscriptions",
        [WebhookFamily.Transfer] = "/v2/transfers",
    };

    private readonly PagouHttpClient _client;
    private readonly WebhookStore _store;

    public WebhookProcessor(PagouHttpClient client, WebhookStore store)
    {
        _client = client;
        _store = store;
    }

    public async Task ProcessEventAsync(WebhookEvent evt, CancellationToken ct = default)
    {
        if (!WebhookParser.IsConfirmedStateChange(evt.EventType))
        {
            Log.Info($"Ignoring non-confirming event {evt.EventType} ({evt.Id})");
            return;
        }
        if (string.IsNullOrEmpty(evt.ResourceId))
        {
            Log.Warn($"Confirmed event {evt.EventType} without a resource id — cannot reconcile.");
            return;
        }

        try
        {
            var result = await _client.RequestDataAsync<StatusOnly>(
                new RequestParams { Method = HttpMethod.Get, Path = $"{ResourcePath[evt.Family]}/{evt.ResourceId}" }, ct)
                .ConfigureAwait(false);
            _store.SetResourceState(evt.ResourceId, result.Data.Status);
            Log.Info($"Reconciled {evt.Family} {evt.ResourceId} → {result.Data.Status}");
        }
        catch (NotFoundException)
        {
            Log.Warn($"Resource {evt.ResourceId} not found during reconciliation.");
        }
        catch (Exception ex)
        {
            // Reconciliation failed after the ack: a real system would requeue this
            // event for a later retry rather than replaying side effects.
            Log.Error($"Reconciliation failed for {evt.Id}", new { message = ex.Message });
            throw;
        }
    }

    private sealed class StatusOnly
    {
        [JsonPropertyName("status")] public string Status { get; init; } = "";
    }
}
