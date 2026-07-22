using System.Text.Json;
using System.Text.Json.Serialization;

namespace Pagou.Examples.Core;

/// <summary>
/// Shared serializer options. Property names are matched case-insensitively and
/// nulls are dropped on the wire; each model annotates its exact field casing
/// (snake_case for most resources, camelCase for subscription responses).
/// </summary>
public static class Json
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
