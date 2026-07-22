using System.Text.Json.Nodes;
using Pagou.Examples.Core;
using Pagou.Examples.Core.Webhooks;
using Xunit;

namespace Pagou.Examples.Tests;

public class WebhooksTests
{
    private static JsonNode Node(string json) => JsonNode.Parse(json)!;

    private static JsonNode LoadFixture(string name) =>
        JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures", name)))!;

    private static PagouHttpClient ClientFor(StubHandler handler) =>
        new(TestConfig.Create(maxRetries: 0), new HttpClient(handler));

    [Fact]
    public void Routes_The_Transaction_Family_Via_Data_EventType()
    {
        var result = WebhookParser.Parse(Node("""{ "id": "evt_1", "event": "transaction", "data": { "id": "tx_1", "event_type": "transaction.paid" } }"""));
        var evt = result.Event!;
        Assert.Equal("evt_1", evt.Id);
        Assert.Equal(WebhookFamily.Transaction, evt.Family);
        Assert.Equal("transaction.paid", evt.EventType);
        Assert.Equal("tx_1", evt.ResourceId);
    }

    [Fact]
    public void Routes_The_Subscription_Family()
    {
        var evt = WebhookParser.Parse(Node("""{ "id": "evt_2", "event": "subscription", "data": { "id": "sub_1", "event_type": "subscription.renewed" } }""")).Event!;
        Assert.Equal(WebhookFamily.Subscription, evt.Family);
        Assert.Equal("subscription.renewed", evt.EventType);
        Assert.Equal("sub_1", evt.ResourceId);
    }

    [Fact]
    public void Routes_The_Transfer_Family_Via_TopLevel_Type_And_Data_Object()
    {
        var evt = WebhookParser.Parse(Node("""{ "id": "evt_3", "type": "payout.transferred", "data": { "object": { "id": "tr_1" } } }""")).Event!;
        Assert.Equal(WebhookFamily.Transfer, evt.Family);
        Assert.Equal("payout.transferred", evt.EventType);
        Assert.Equal("tr_1", evt.ResourceId);
    }

    [Fact]
    public void Rejects_A_Body_With_No_Event_Id()
    {
        var result = WebhookParser.Parse(Node("""{ "event": "transaction", "data": {} }"""));
        Assert.True(result.IsError);
        Assert.Equal("missing_event_id", result.Error);
    }

    [Theory]
    [InlineData("webhook.transaction.json")]
    [InlineData("webhook.subscription.json")]
    [InlineData("webhook.transfer.json")]
    public void Parses_Each_Family_Fixture_Without_Error(string fixture)
    {
        Assert.False(WebhookParser.Parse(LoadFixture(fixture)).IsError);
    }

    [Fact]
    public void Treats_Terminal_Money_Events_As_Confirmed()
    {
        Assert.True(WebhookParser.IsConfirmedStateChange("transaction.paid"));
        Assert.True(WebhookParser.IsConfirmedStateChange("payout.transferred"));
    }

    [Fact]
    public void Treats_Informational_Events_As_NonConfirming()
    {
        Assert.False(WebhookParser.IsConfirmedStateChange("transaction.created"));
        Assert.False(WebhookParser.IsConfirmedStateChange("subscription.trial_will_end"));
    }

    [Fact]
    public void Dedupe_Returns_True_Once_Then_False_For_Redeliveries()
    {
        var store = new WebhookStore();
        Assert.True(store.MarkProcessed("evt_x"));
        Assert.False(store.MarkProcessed("evt_x"));
    }

    [Fact]
    public async Task ProcessEvent_Reconciles_And_Updates_State_On_A_Confirmed_Event()
    {
        var handler = StubHandler.Sequence(StubHandler.Json(200, new { success = true, requestId = "r", data = new { status = "paid" } }));
        var store = new WebhookStore();
        var processor = new WebhookProcessor(ClientFor(handler), store);

        await processor.ProcessEventAsync(new WebhookEvent("evt_1", WebhookFamily.Transaction, "transaction.paid", "tx_1", null));

        Assert.Equal(1, handler.Calls);
        Assert.Equal("paid", store.GetResourceState("tx_1"));
    }

    [Fact]
    public async Task ProcessEvent_Does_Not_Reconcile_Or_Change_State_On_A_NonConfirming_Event()
    {
        var handler = StubHandler.Sequence(StubHandler.Json(200, new { success = true, requestId = "r", data = new { status = "paid" } }));
        var store = new WebhookStore();
        var processor = new WebhookProcessor(ClientFor(handler), store);

        await processor.ProcessEventAsync(new WebhookEvent("evt_2", WebhookFamily.Transaction, "transaction.created", "tx_2", null));

        Assert.Equal(0, handler.Calls);
        Assert.Null(store.GetResourceState("tx_2"));
    }

    [Fact]
    public async Task ProcessEvent_Skips_Reconciliation_When_The_Confirmed_Event_Has_No_Resource_Id()
    {
        var handler = StubHandler.Sequence(StubHandler.Json(200, new { success = true, requestId = "r", data = new { status = "paid" } }));
        var store = new WebhookStore();
        var processor = new WebhookProcessor(ClientFor(handler), store);

        await processor.ProcessEventAsync(new WebhookEvent("evt_3", WebhookFamily.Transaction, "transaction.paid", "", null));

        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task ProcessEvent_Leaves_State_Unchanged_When_The_Resource_Is_Not_Found()
    {
        var handler = StubHandler.Sequence(StubHandler.Json(404, new { message = "not found" }));
        var store = new WebhookStore();
        var processor = new WebhookProcessor(ClientFor(handler), store);

        await processor.ProcessEventAsync(new WebhookEvent("evt_4", WebhookFamily.Transfer, "payout.transferred", "tr_x", null));

        Assert.Null(store.GetResourceState("tr_x"));
    }
}
