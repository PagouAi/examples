using System.Text.Json.Nodes;
using Pagou.Examples.Core;
using Xunit;

namespace Pagou.Examples.Tests;

public class HttpClientTests
{
    private static PagouHttpClient ClientFor(StubHandler handler, int timeoutMs = 1000, int maxRetries = 1) =>
        new(TestConfig.Create(timeoutMs, maxRetries), new HttpClient(handler));

    [Fact]
    public async Task Unwraps_The_Success_RequestId_Data_Envelope()
    {
        var handler = StubHandler.Sequence(
            StubHandler.Json(200, new { success = true, requestId = "req_1", data = new { id = "tx_1" } }));
        var client = ClientFor(handler);

        var result = await client.RequestDataAsync<JsonNode>(new RequestParams
        {
            Method = HttpMethod.Get,
            Path = "/v2/transactions/tx_1",
        });

        Assert.Equal("tx_1", result.Data!["id"]!.GetValue<string>());
        Assert.Equal("req_1", result.RequestId);
    }

    [Fact]
    public async Task Sends_Authorization_And_A_Generated_Correlation_Id()
    {
        var handler = StubHandler.Sequence(StubHandler.Json(200, new { success = true, requestId = "r", data = new { } }));
        var client = ClientFor(handler);

        await client.RequestDataAsync<JsonNode>(new RequestParams { Method = HttpMethod.Get, Path = "/v2/transactions" });

        var request = handler.Requests[0];
        Assert.Equal("Bearer test_token", request.Headers.GetValues("Authorization").Single());
        Assert.Matches("[0-9a-f-]{36}", request.Headers.GetValues("X-Request-Id").Single());
    }

    [Fact]
    public async Task Maps_A_404_To_NotFound_Without_Retrying()
    {
        var handler = StubHandler.Sequence(StubHandler.Json(404, new { message = "not found", code = "NOT_FOUND" }));
        var client = ClientFor(handler);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            client.RequestDataAsync<JsonNode>(new RequestParams { Method = HttpMethod.Get, Path = "/v2/transactions/x" }));
        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task Retries_A_500_On_Get_Then_Succeeds()
    {
        var handler = StubHandler.Sequence(
            StubHandler.Json(500, new { message = "boom" }),
            StubHandler.Json(200, new { success = true, requestId = "r", data = new { ok = true } }));
        var client = ClientFor(handler);

        var result = await client.RequestDataAsync<JsonNode>(new RequestParams { Method = HttpMethod.Get, Path = "/v2/transactions" });
        Assert.True(result.Data!["ok"]!.GetValue<bool>());
        Assert.Equal(2, handler.Calls);
    }

    [Fact]
    public async Task Does_Not_Retry_A_Post_Without_An_Idempotency_Key()
    {
        var handler = StubHandler.Sequence(StubHandler.Json(500, new { message = "boom" }));
        var client = ClientFor(handler);

        await Assert.ThrowsAsync<ServerException>(() =>
            client.RequestDataAsync<JsonNode>(new RequestParams { Method = HttpMethod.Post, Path = "/v2/transactions", Body = new { } }));
        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task Retries_A_Post_When_An_Idempotency_Key_Is_Present()
    {
        var handler = StubHandler.Sequence(
            StubHandler.Json(503, new { message = "unavailable" }),
            StubHandler.Json(200, new { success = true, requestId = "r", data = new { id = "tx" } }));
        var client = ClientFor(handler);

        var result = await client.RequestDataAsync<JsonNode>(new RequestParams
        {
            Method = HttpMethod.Post,
            Path = "/v2/transactions",
            Body = new { },
            IdempotencyKey = "idem_1",
        });

        Assert.Equal("tx", result.Data!["id"]!.GetValue<string>());
        Assert.Equal("idem_1", handler.Requests[0].Headers.GetValues("Idempotency-Key").Single());
    }

    [Fact]
    public async Task Raises_NetworkError_With_A_Timeout_Message_When_The_Request_Aborts()
    {
        var handler = StubHandler.Hanging();
        var client = ClientFor(handler, timeoutMs: 30, maxRetries: 0);

        var error = await Assert.ThrowsAsync<NetworkException>(() =>
            client.RequestDataAsync<JsonNode>(new RequestParams { Method = HttpMethod.Get, Path = "/v2/transactions" }));
        Assert.Equal("Request timed out", error.Message);
    }

    [Fact]
    public async Task Serializes_Array_Query_Params_As_Comma_Joined_Values()
    {
        var handler = StubHandler.Sequence(StubHandler.Json(200, new
        {
            success = true,
            requestId = "r",
            data = Array.Empty<object>(),
            next_cursor = (string?)null,
            prev_cursor = (string?)null,
            total = 0,
        }));
        var client = ClientFor(handler);

        await client.RequestCursorPageAsync<JsonNode>(new RequestParams
        {
            Method = HttpMethod.Get,
            Path = "/v2/transactions",
            Query = new Dictionary<string, object?> { ["paymentMethods"] = new[] { "pix", "credit_card" } },
        });

        var query = Uri.UnescapeDataString(handler.Requests[0].RequestUri!.Query);
        Assert.Contains("paymentMethods=pix,credit_card", query);
    }
}
