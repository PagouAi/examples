using System.Net;
using System.Text;
using System.Text.Json;
using Pagou.Examples.Core;

namespace Pagou.Examples.Tests;

/// <summary>
/// Test double for the transport layer. It records each request and returns a
/// canned response chosen by attempt index, mirroring how the TS suite injects a
/// stub `fetch`. This keeps the shared client tests fully offline.
/// </summary>
internal sealed class StubHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, int, CancellationToken, Task<HttpResponseMessage>> _responder;

    public int Calls { get; private set; }
    public List<HttpRequestMessage> Requests { get; } = new();

    public StubHandler(Func<HttpRequestMessage, int, CancellationToken, Task<HttpResponseMessage>> responder)
    {
        _responder = responder;
    }

    public static StubHandler Sequence(params HttpResponseMessage[] responses) =>
        new((_, attempt, _) => Task.FromResult(responses[Math.Min(attempt, responses.Length - 1)]));

    /// <summary>A handler that never responds until the request is cancelled — used to test timeouts.</summary>
    public static StubHandler Hanging() =>
        new(async (_, _, ct) =>
        {
            await Task.Delay(Timeout.Infinite, ct);
            return Json(200, new { });
        });

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        // Buffer the content so tests can inspect it after the client disposes the request.
        if (request.Content is not null)
        {
            await request.Content.LoadIntoBufferAsync();
        }
        Requests.Add(request);
        var attempt = Calls++;
        return await _responder(request, attempt, cancellationToken);
    }

    public static HttpResponseMessage Json(int status, object body, IDictionary<string, string>? headers = null)
    {
        var message = new HttpResponseMessage((HttpStatusCode)status)
        {
            Content = new StringContent(JsonSerializer.Serialize(body, Pagou.Examples.Core.Json.Options), Encoding.UTF8, "application/json"),
        };
        if (headers is not null)
        {
            foreach (var (key, value) in headers)
            {
                message.Headers.TryAddWithoutValidation(key, value);
            }
        }
        return message;
    }
}

internal static class TestConfig
{
    public static PagouConfig Create(int timeoutMs = 1000, int maxRetries = 1) => new()
    {
        Environment = PagouEnvironment.Sandbox,
        BaseUrl = "https://api.sandbox.pagou.ai",
        ApiToken = "test_token",
        TimeoutMs = timeoutMs,
        MaxRetries = maxRetries,
    };
}
