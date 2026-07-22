using System.Text.Json.Nodes;

namespace Pagou.Examples.Core;

/// <summary>Structured fields carried by every mapped API error.</summary>
public readonly record struct ApiErrorFields(
    int? Status = null,
    string? Code = null,
    string? RequestId = null,
    JsonNode? Details = null,
    JsonNode? Raw = null,
    Exception? Cause = null);

/// <summary>Base class for every error surfaced by the raw HTTP reference client.</summary>
public class ApiException : Exception
{
    public int? Status { get; }
    public string? Code { get; }
    public string? RequestId { get; }
    public JsonNode? Details { get; }
    public JsonNode? Raw { get; }

    public ApiException(string message, ApiErrorFields fields = default)
        : base(message, fields.Cause)
    {
        Status = fields.Status;
        Code = fields.Code;
        RequestId = fields.RequestId;
        Details = fields.Details;
        Raw = fields.Raw;
    }
}

public sealed class AuthenticationException : ApiException // 401
{
    public AuthenticationException(string message, ApiErrorFields fields = default) : base(message, fields) { }
}

public sealed class PermissionException : ApiException // 403
{
    public PermissionException(string message, ApiErrorFields fields = default) : base(message, fields) { }
}

public sealed class InvalidRequestException : ApiException // 400/422 and other 4xx
{
    public InvalidRequestException(string message, ApiErrorFields fields = default) : base(message, fields) { }
}

public sealed class NotFoundException : ApiException // 404
{
    public NotFoundException(string message, ApiErrorFields fields = default) : base(message, fields) { }
}

public sealed class ConflictException : ApiException // 409 (e.g. duplicate external_ref)
{
    public ConflictException(string message, ApiErrorFields fields = default) : base(message, fields) { }
}

public sealed class RateLimitException : ApiException // 429
{
    public RateLimitException(string message, ApiErrorFields fields = default) : base(message, fields) { }
}

public sealed class ServerException : ApiException // 5xx
{
    public ServerException(string message, ApiErrorFields fields = default) : base(message, fields) { }
}

public sealed class NetworkException : ApiException // transport failure / timeout
{
    public NetworkException(string message, ApiErrorFields fields = default) : base(message, fields) { }
}

public static class Errors
{
    /// <summary>Maps an HTTP status + response body to the matching typed error.</summary>
    public static ApiException ToApiError(int status, JsonNode? body, string? requestIdFromHeader)
    {
        var (message, code, requestId, details) = ParseErrorBody(body, requestIdFromHeader);
        var fields = new ApiErrorFields(status, code, requestId, details, body);
        return status switch
        {
            401 => new AuthenticationException(message, fields),
            403 => new PermissionException(message, fields),
            404 => new NotFoundException(message, fields),
            409 => new ConflictException(message, fields),
            429 => new RateLimitException(message, fields),
            _ => status >= 500
                ? new ServerException(message, fields)
                : new InvalidRequestException(message, fields),
        };
    }

    /// <summary>
    /// Normalizes the two documented error shapes: the simple
    /// <c>{ error, message, status }</c> body and RFC 7807 problem+json
    /// (<c>{ title, detail, errors[] }</c>).
    /// </summary>
    private static (string Message, string? Code, string? RequestId, JsonNode? Details) ParseErrorBody(
        JsonNode? body, string? fallbackRequestId)
    {
        if (body is not JsonObject obj)
        {
            return ("Request failed", null, fallbackRequestId, null);
        }

        string? Str(string key) =>
            obj.TryGetPropertyValue(key, out var node) && node is JsonValue value && value.TryGetValue<string>(out var s)
                ? s
                : null;

        var message = Str("message") ?? Str("detail") ?? Str("title") ?? Str("error") ?? "Request failed";
        var code = Str("code") ?? Str("error");
        var requestId = Str("requestId") ?? Str("request_id") ?? fallbackRequestId;
        JsonNode? details = obj.TryGetPropertyValue("errors", out var errors)
            ? errors?.DeepClone()
            : (obj.TryGetPropertyValue("details", out var d) ? d?.DeepClone() : null);

        return (message, code, requestId, details);
    }
}
