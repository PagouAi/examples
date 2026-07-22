using Pagou.Examples.Core;
using Xunit;

namespace Pagou.Examples.Tests;

public class ReconcileTests
{
    private static PagouHttpClient ClientFor(StubHandler handler) =>
        new(TestConfig.Create(maxRetries: 0), new HttpClient(handler));

    [Theory]
    [InlineData("paid", FulfillmentDecision.Fulfill)]
    [InlineData("captured", FulfillmentDecision.Fulfill)]
    [InlineData("pending", FulfillmentDecision.Wait)]
    [InlineData("three_ds_required", FulfillmentDecision.Wait)]
    [InlineData("processing", FulfillmentDecision.Wait)]
    [InlineData("expired", FulfillmentDecision.Cancel)]
    [InlineData("refused", FulfillmentDecision.Cancel)]
    [InlineData("canceled", FulfillmentDecision.Cancel)]
    public void DecideFulfillment_Maps_Status_To_Decision(string status, FulfillmentDecision expected)
    {
        Assert.Equal(expected, Reconciler.DecideFulfillment(status));
    }

    [Fact]
    public async Task Fetches_The_Transaction_And_Returns_A_Fulfillment_Decision()
    {
        var handler = StubHandler.Sequence(
            StubHandler.Json(200, new { success = true, requestId = "r", data = new { id = "tx_1", status = "paid" } }));
        var result = await Reconciler.ReconcileTransactionAsync("tx_1", ClientFor(handler));

        Assert.NotNull(result);
        Assert.Equal(FulfillmentDecision.Fulfill, result!.Value.Decision);
        Assert.Equal("paid", result.Value.Transaction.Status);
    }

    [Fact]
    public async Task Returns_Null_When_The_Transaction_Does_Not_Exist()
    {
        var handler = StubHandler.Sequence(StubHandler.Json(404, new { message = "not found" }));
        var result = await Reconciler.ReconcileTransactionAsync("missing", ClientFor(handler));
        Assert.Null(result);
    }
}
