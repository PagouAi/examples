using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Pagou.Examples.Core;

/// <summary>
/// Masks sensitive fields before anything is logged so secrets, tokens and card
/// data never reach stdout or a log sink.
/// </summary>
public static partial class Redactor
{
    private static readonly HashSet<string> SensitiveKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "authorization", "apikey", "api_key", "token", "access_token", "client_secret",
        "secret", "password", "cvv", "cvc", "pan", "card_number", "number",
    };

    private const string RedactedText = "[REDACTED]";

    [GeneratedRegex(@"\bBearer\s+[A-Za-z0-9._-]+", RegexOptions.IgnoreCase)]
    private static partial Regex BearerPattern();

    [GeneratedRegex(@"\bpg(ct|pm|sk|pk)_[A-Za-z0-9]+")]
    private static partial Regex CardTokenPattern();

    /// <summary>Masks bearer tokens and card tokens embedded in free text.</summary>
    public static string RedactText(string value)
    {
        value = BearerPattern().Replace(value, RedactedText);
        value = CardTokenPattern().Replace(value, RedactedText);
        return value;
    }

    /// <summary>Serializes a value to JSON and returns a redacted copy of it.</summary>
    public static JsonNode? RedactToNode(object? value)
    {
        var node = value as JsonNode ?? (value is null ? null : JsonSerializer.SerializeToNode(value, Json.Options));
        return Redact(node);
    }

    /// <summary>Recursively rebuilds a node with sensitive keys and token strings masked.</summary>
    public static JsonNode? Redact(JsonNode? node)
    {
        switch (node)
        {
            case JsonObject obj:
                var result = new JsonObject();
                foreach (var pair in obj)
                {
                    result[pair.Key] = SensitiveKeys.Contains(pair.Key)
                        ? RedactedText
                        : Redact(pair.Value);
                }
                return result;

            case JsonArray array:
                var redactedArray = new JsonArray();
                foreach (var item in array)
                {
                    redactedArray.Add(Redact(item));
                }
                return redactedArray;

            case JsonValue value:
                return value.TryGetValue<string>(out var text)
                    ? JsonValue.Create(RedactText(text))
                    : value.DeepClone();

            default:
                return null;
        }
    }
}
