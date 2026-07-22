namespace Pagou.Examples.Core;

/// <summary>Synthetic buyer data — safe to commit. Never use real documents or PII.</summary>
public static class DemoData
{
    public static readonly Buyer DemoBuyer = new()
    {
        Name = "Ana Souza",
        Email = "ana.souza@example.com",
        Document = new Document { Type = "CPF", Number = "19100000000" },
    };

    public static readonly IReadOnlyList<ProductInput> DemoProducts = new[]
    {
        new ProductInput { Name = "Pro Plan", Price = 4900, Quantity = 1 },
    };

    /// <summary>Reads a resource id from the first CLI argument or an env var.</summary>
    public static string ResourceIdFromArgs(string[] args, string envVar)
    {
        var id = args.Length > 0 ? args[0] : System.Environment.GetEnvironmentVariable(envVar);
        if (string.IsNullOrEmpty(id))
        {
            throw new InvalidOperationException($"Pass a resource id as the first argument or set {envVar}.");
        }
        return id;
    }

    /// <summary>A monotonic-ish suffix used to keep demo `external_ref` values unique.</summary>
    public static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
