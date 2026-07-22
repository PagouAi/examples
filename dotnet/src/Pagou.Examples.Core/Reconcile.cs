namespace Pagou.Examples.Core;

public enum FulfillmentDecision
{
    Fulfill,
    Wait,
    Cancel,
}

/// <summary>
/// Server-side reconciliation: fetch the transaction from the API (the source of
/// truth) and decide whether to fulfill. Business state changes only on this
/// confirmed result, never on an unverified webhook body.
/// </summary>
public static class Reconciler
{
    /// <summary>Statuses at which a charge is settled and it is safe to fulfill.</summary>
    private static readonly HashSet<string> TerminalPaidStatuses = new() { "paid", "captured" };

    /// <summary>Terminal failure/cancel states: stop waiting, release the order.</summary>
    private static readonly HashSet<string> TerminalFailedStatuses = new() { "canceled", "expired", "refused" };

    /// <summary>Maps a transaction status to a business decision. Never fulfill on a pending state.</summary>
    public static FulfillmentDecision DecideFulfillment(string status)
    {
        if (TerminalPaidStatuses.Contains(status))
        {
            return FulfillmentDecision.Fulfill;
        }
        if (TerminalFailedStatuses.Contains(status))
        {
            return FulfillmentDecision.Cancel;
        }
        return FulfillmentDecision.Wait;
    }

    public static async Task<(Transaction Transaction, FulfillmentDecision Decision)?> ReconcileTransactionAsync(
        string id, PagouHttpClient client, CancellationToken ct = default)
    {
        try
        {
            var result = await client.RequestDataAsync<Transaction>(
                new RequestParams { Method = HttpMethod.Get, Path = $"/v2/transactions/{id}" }, ct)
                .ConfigureAwait(false);
            return (result.Data, DecideFulfillment(result.Data.Status));
        }
        catch (NotFoundException)
        {
            return null;
        }
    }
}

/// <summary>Statuses from which a transfer can typically be cancelled.</summary>
public static class TransferStatuses
{
    public static readonly HashSet<string> Cancelable = new() { "pending", "scheduled" };
}
