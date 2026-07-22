using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Pagou.Examples.Core;

public sealed record RequestParams
{
    public required HttpMethod Method { get; init; }
    public required string Path { get; init; }
    public IReadOnlyDictionary<string, object?>? Query { get; init; }
    public object? Body { get; init; }

    /// <summary>Sent as <c>Idempotency-Key</c>; also makes a write retryable on transient failures.</summary>
    public string? IdempotencyKey { get; init; }

    /// <summary>Correlation id echoed as <c>X-Request-Id</c>. Auto-generated when omitted.</summary>
    public string? RequestId { get; init; }

    public int? TimeoutMs { get; init; }
}

public sealed record Result<T>(T Data, int Status, string? RequestId);

/// <summary>Cursor envelope for list endpoints (<c>next_cursor</c>/<c>prev_cursor</c> are snake_case).</summary>
public sealed class CursorPage<T>
{
    [JsonPropertyName("success")] public bool Success { get; init; }
    [JsonPropertyName("requestId")] public string? RequestId { get; init; }
    [JsonPropertyName("data")] public List<T> Data { get; init; } = new();
    [JsonPropertyName("next_cursor")] public string? NextCursor { get; init; }
    [JsonPropertyName("prev_cursor")] public string? PrevCursor { get; init; }
    [JsonPropertyName("total")] public int Total { get; init; }
}

internal sealed class DataEnvelope<T>
{
    [JsonPropertyName("success")] public bool Success { get; init; }
    [JsonPropertyName("requestId")] public string? RequestId { get; init; }
    [JsonPropertyName("data")] public T? Data { get; init; }
}

/// <summary>
/// Minimal reference client for the Pagou API v2 built on <see cref="System.Net.Http.HttpClient"/>.
/// It demonstrates the fundamentals every language example must show: server-side
/// auth, correlation ids, idempotency keys, timeouts, bounded retries for transient
/// failures on idempotent operations, typed errors and redacted logging.
/// </summary>
public sealed class PagouHttpClient
{
    private static readonly HashSet<int> RetryableStatus = new() { 429, 500, 502, 503, 504 };

    private readonly PagouConfig _config;
    private readonly HttpClient _http;

    public PagouHttpClient(PagouConfig? config = null, HttpClient? http = null)
    {
        _config = config ?? Config.Load();
        if (http is null)
        {
            _http = new HttpClient { Timeout = Timeout.InfiniteTimeSpan };
        }
        else
        {
            _http = http;
        }
    }

    /// <summary>Returns the raw parsed body of a request.</summary>
    public async Task<Result<JsonNode?>> RequestAsync(RequestParams p, CancellationToken ct = default)
    {
        var (body, status, requestId) = await SendAsync(p, ct).ConfigureAwait(false);
        return new Result<JsonNode?>(body, status, requestId);
    }

    /// <summary>Unwraps a <c>{ success, requestId, data }</c> envelope to its <c>data</c>.</summary>
    public async Task<Result<T>> RequestDataAsync<T>(RequestParams p, CancellationToken ct = default)
    {
        var (body, status, requestId) = await SendAsync(p, ct).ConfigureAwait(false);
        var envelope = body?.Deserialize<DataEnvelope<T>>(Json.Options);
        return new Result<T>(envelope is not null ? envelope.Data! : default!, status, envelope?.RequestId ?? requestId);
    }

    /// <summary>Returns a full cursor page (keeps <c>next_cursor</c>/<c>prev_cursor</c>/<c>total</c>).</summary>
    public async Task<Result<CursorPage<T>>> RequestCursorPageAsync<T>(RequestParams p, CancellationToken ct = default)
    {
        var (body, status, requestId) = await SendAsync(p, ct).ConfigureAwait(false);
        var page = body?.Deserialize<CursorPage<T>>(Json.Options) ?? new CursorPage<T>();
        return new Result<CursorPage<T>>(page, status, requestId);
    }

    private async Task<(JsonNode? Body, int Status, string RequestId)> SendAsync(RequestParams p, CancellationToken ct)
    {
        var requestId = p.RequestId ?? Guid.NewGuid().ToString();
        var url = BuildUrl(p.Path, p.Query);
        var retryable = CanRetry(p.Method, p.IdempotencyKey);
        var maxAttempts = retryable ? _config.MaxRetries + 1 : 1;

        Log.Info($"→ {p.Method} {url.PathAndQuery}", new { requestId, body = p.Body });

        Exception? lastError = null;
        for (var attempt = 0; attempt < maxAttempts; attempt++)
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(p.TimeoutMs ?? _config.TimeoutMs);

            try
            {
                using var request = new HttpRequestMessage(p.Method, url);
                request.Headers.TryAddWithoutValidation("Accept", "application/json");
                request.Headers.TryAddWithoutValidation("X-Request-Id", requestId);
                // The API key is a server-side secret; it is never read in browser code.
                request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {_config.ApiToken}");
                if (!string.IsNullOrEmpty(p.IdempotencyKey))
                {
                    request.Headers.TryAddWithoutValidation("Idempotency-Key", p.IdempotencyKey);
                }
                if (p.Body is not null)
                {
                    var json = JsonSerializer.Serialize(p.Body, Json.Options);
                    request.Content = new StringContent(json, Encoding.UTF8, "application/json");
                }

                using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseContentRead, cts.Token)
                    .ConfigureAwait(false);
                var responseId = response.Headers.TryGetValues("x-request-id", out var ids)
                    ? ids.FirstOrDefault() ?? requestId
                    : requestId;
                var body = await ParseBodyAsync(response, cts.Token).ConfigureAwait(false);
                var status = (int)response.StatusCode;

                if (!response.IsSuccessStatusCode)
                {
                    if (retryable && RetryableStatus.Contains(status) && attempt < maxAttempts - 1)
                    {
                        await Task.Delay(BackoffMs(attempt, RetryAfter(response)), ct).ConfigureAwait(false);
                        continue;
                    }
                    var error = Errors.ToApiError(status, body, responseId);
                    Log.Warn($"← {status} {p.Method} {url.AbsolutePath}", new { requestId = responseId, code = error.Code });
                    throw error;
                }

                Log.Info($"← {status} {p.Method} {url.AbsolutePath}", new { requestId = responseId });
                return (body, status, responseId);
            }
            catch (ApiException)
            {
                // A mapped API error (4xx/5xx already resolved above) is terminal here.
                throw;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw; // The caller aborted; propagate.
            }
            catch (Exception ex)
            {
                lastError = ex;
                var isTimeout = ex is OperationCanceledException;
                // Retry transport failures/timeouts on idempotent operations only.
                if (retryable && attempt < maxAttempts - 1)
                {
                    await Task.Delay(BackoffMs(attempt, null), ct).ConfigureAwait(false);
                    continue;
                }
                throw new NetworkException(
                    isTimeout ? "Request timed out" : "Network request failed",
                    new ApiErrorFields(RequestId: requestId, Cause: ex));
            }
        }

        throw new NetworkException("Request failed after retries", new ApiErrorFields(RequestId: requestId, Cause: lastError));
    }

    private Uri BuildUrl(string path, IReadOnlyDictionary<string, object?>? query)
    {
        var baseUri = new Uri(_config.BaseUrl.TrimEnd('/') + "/");
        var builder = new UriBuilder(new Uri(baseUri, path.TrimStart('/')));

        if (query is not null)
        {
            var parts = new List<string>();
            foreach (var (key, value) in query)
            {
                if (value is null)
                {
                    continue;
                }

                string serialized;
                if (value is System.Collections.IEnumerable enumerable && value is not string)
                {
                    var items = enumerable.Cast<object?>().Where(x => x is not null).Select(x => x!.ToString());
                    var joined = string.Join(",", items);
                    if (joined.Length == 0)
                    {
                        continue;
                    }
                    serialized = joined;
                }
                else
                {
                    serialized = value.ToString() ?? "";
                }

                parts.Add($"{Uri.EscapeDataString(key)}={Uri.EscapeDataString(serialized)}");
            }
            builder.Query = string.Join("&", parts);
        }

        return builder.Uri;
    }

    private static bool IsIdempotentMethod(HttpMethod method) => method == HttpMethod.Get || method == HttpMethod.Head;

    private static bool CanRetry(HttpMethod method, string? idempotencyKey)
    {
        if (IsIdempotentMethod(method))
        {
            return true;
        }
        // Writes are retried only when an idempotency key guards against duplicates.
        return (method == HttpMethod.Post || method == HttpMethod.Put) && !string.IsNullOrEmpty(idempotencyKey);
    }

    private static async Task<JsonNode?> ParseBodyAsync(HttpResponseMessage response, CancellationToken ct)
    {
        var text = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        if (string.IsNullOrEmpty(text))
        {
            return null;
        }

        var contentType = response.Content.Headers.ContentType?.MediaType ?? "";
        if (contentType.Contains("json", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                return JsonNode.Parse(text);
            }
            catch (JsonException)
            {
                return JsonValue.Create(text);
            }
        }
        return JsonValue.Create(text);
    }

    private static int BackoffMs(int attempt, string? retryAfter)
    {
        if (retryAfter is not null && double.TryParse(retryAfter, out var seconds) && double.IsFinite(seconds))
        {
            return (int)Math.Min(seconds * 1000, 5000);
        }
        var baseMs = 200 * (int)Math.Pow(2, attempt);
        var jitter = (int)(DeterministicJitter(attempt) * 200);
        return Math.Min(baseMs + jitter, 5000);
    }

    // Small deterministic jitter keeps the reference reproducible without a random source.
    private static double DeterministicJitter(int attempt)
    {
        var x = Math.Sin(attempt + 1) * 10_000;
        return x - Math.Floor(x);
    }

    private static string? RetryAfter(HttpResponseMessage response) =>
        response.Headers.TryGetValues("Retry-After", out var values) ? values.FirstOrDefault() : null;
}
