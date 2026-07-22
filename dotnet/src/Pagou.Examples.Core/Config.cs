namespace Pagou.Examples.Core;

public enum PagouEnvironment
{
    Sandbox,
    Production,
}

/// <summary>Immutable configuration loaded from the environment.</summary>
public sealed record PagouConfig
{
    public required PagouEnvironment Environment { get; init; }
    public required string BaseUrl { get; init; }
    public required string ApiToken { get; init; }
    public string? WebhookUrl { get; init; }
    public string? PublishableKey { get; init; }
    public int TimeoutMs { get; init; } = 30_000;
    public int MaxRetries { get; init; } = 2;
}

/// <summary>
/// Loads and validates configuration from the environment. The API token is a
/// server-side secret and is never exposed to the browser.
/// </summary>
public static class Config
{
    private const string SandboxBaseUrl = "https://api.sandbox.pagou.ai";
    private const string ProductionBaseUrl = "https://api.pagou.ai";

    public static PagouConfig Load()
    {
        EnvFile.Load();
        var environment = ResolveEnvironment();
        return new PagouConfig
        {
            Environment = environment,
            BaseUrl = ResolveBaseUrl(environment),
            ApiToken = RequireEnv("PAGOU_API_TOKEN"),
            WebhookUrl = GetEnv("PAGOU_WEBHOOK_URL"),
            PublishableKey = GetEnv("PAGOU_PUBLISHABLE_KEY"),
            TimeoutMs = int.TryParse(GetEnv("PAGOU_TIMEOUT_MS"), out var timeout) ? timeout : 30_000,
            MaxRetries = int.TryParse(GetEnv("PAGOU_MAX_RETRIES"), out var retries) ? retries : 2,
        };
    }

    private static PagouEnvironment ResolveEnvironment()
    {
        var raw = (GetEnv("PAGOU_ENVIRONMENT") ?? "sandbox").ToLowerInvariant();
        return raw switch
        {
            "sandbox" => PagouEnvironment.Sandbox,
            "production" => PagouEnvironment.Production,
            _ => throw new InvalidOperationException($"PAGOU_ENVIRONMENT must be \"sandbox\" or \"production\", got \"{raw}\"."),
        };
    }

    private static string ResolveBaseUrl(PagouEnvironment environment)
    {
        var over = GetEnv("PAGOU_BASE_URL")?.Trim();
        if (!string.IsNullOrEmpty(over))
        {
            return over.TrimEnd('/');
        }
        return environment == PagouEnvironment.Production ? ProductionBaseUrl : SandboxBaseUrl;
    }

    private static string RequireEnv(string name)
    {
        var value = GetEnv(name);
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(
                $"Missing required environment variable {name}. Copy .env.example to .env and set it.");
        }
        return value;
    }

    private static string? GetEnv(string name)
    {
        var value = System.Environment.GetEnvironmentVariable(name);
        return string.IsNullOrEmpty(value) ? null : value;
    }
}
