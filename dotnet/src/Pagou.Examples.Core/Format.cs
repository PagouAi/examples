using System.Globalization;
using System.Text.Json;

namespace Pagou.Examples.Core;

public static class Format
{
    /// <summary>Formats an integer amount in the smallest currency unit as a display string.</summary>
    public static string FormatAmount(int cents, string currency = "BRL")
    {
        var numberFormat = CultureInfo.GetCultureInfo("pt-BR").NumberFormat;
        return $"{(cents / 100m).ToString("N2", numberFormat)} {currency}";
    }

    /// <summary>A short, unique idempotency key for a given operation and reference.</summary>
    public static string IdempotencyKey(string operation, string reference) => $"{operation}_{reference}";

    /// <summary>Prints a labelled JSON block for readable script output.</summary>
    public static void PrintResult(string label, object? value)
    {
        Console.WriteLine($"\n{label}:");
        Console.WriteLine(JsonSerializer.Serialize(value, IndentedOptions));
    }

    private static readonly JsonSerializerOptions IndentedOptions = new(Json.Options) { WriteIndented = true };
}
