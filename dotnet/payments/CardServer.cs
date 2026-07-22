using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pagou.Examples.Core;
using static Pagou.Examples.Core.DemoData;

namespace Pagou.Examples.Payments;

/// <summary>
/// Minimal server for the browser card flow. It serves the Payment Element page
/// (injecting only the publishable key) and exposes POST /api/pay, which turns
/// the browser's pgct_ token into a real charge via POST /v2/transactions.
/// </summary>
public static class CardServer
{
    public static async Task RunAsync()
    {
        var config = Config.Load();
        var client = new PagouHttpClient(config);
        var port = int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var p) ? p : 3000;
        var htmlPath = Path.Combine(AppContext.BaseDirectory, "card-element", "index.html");

        using var listener = new HttpListener();
        listener.Prefixes.Add($"http://localhost:{port}/");
        listener.Start();
        Log.Info($"Card demo on http://localhost:{port}");

        while (true)
        {
            var context = await listener.GetContextAsync();
            _ = HandleAsync(context, client, config, htmlPath);
        }
    }

    private static async Task HandleAsync(HttpListenerContext context, PagouHttpClient client, PagouConfig config, string htmlPath)
    {
        var request = context.Request;
        var response = context.Response;
        try
        {
            if (request.HttpMethod == "GET" && (request.Url?.AbsolutePath is "/" or "/index.html"))
            {
                var html = await File.ReadAllTextAsync(htmlPath);
                var publishableKey = config.PublishableKey ?? "pk_test_set_PAGOU_PUBLISHABLE_KEY";
                await WriteAsync(response, 200, "text/html", html.Replace("__PUBLISHABLE_KEY__", publishableKey));
                return;
            }

            if (request.HttpMethod == "POST" && request.Url?.AbsolutePath == "/api/pay")
            {
                var body = await ReadBodyAsync(request);
                var token = (JsonNode.Parse(body) as JsonObject)?["token"]?.GetValue<string>();
                if (string.IsNullOrEmpty(token) || !(token.StartsWith("pgct_") || token.StartsWith("pgpm_")))
                {
                    await WriteJsonAsync(response, 400, new { error = "A pgct_/pgpm_ token is required." });
                    return;
                }

                var input = new CreateTransactionInput
                {
                    Amount = 4900,
                    Method = "credit_card",
                    Currency = "BRL",
                    Token = token,
                    Installments = 1,
                    Buyer = DemoBuyer,
                    Products = DemoProducts,
                    ExternalRef = $"card_{Now()}",
                };

                var tx = (await client.RequestDataAsync<Transaction>(new RequestParams
                {
                    Method = HttpMethod.Post,
                    Path = "/v2/transactions",
                    Body = input,
                })).Data;

                // Return id/status/next_action so the browser SDK can continue 3DS.
                // Do NOT fulfill here — wait for the confirmed webhook.
                await WriteJsonAsync(response, 200, new
                {
                    data = new { id = tx.Id, status = tx.Status, next_action = tx.NextAction },
                });
                return;
            }

            await WriteAsync(response, 404, "text/plain", "Not found");
        }
        catch (Exception error)
        {
            Log.Error("Request failed", new { message = error.Message });
            await WriteJsonAsync(response, 500, new { error = "Unexpected error" });
        }
    }

    private static async Task<string> ReadBodyAsync(HttpListenerRequest request)
    {
        using var reader = new StreamReader(request.InputStream, request.ContentEncoding);
        return await reader.ReadToEndAsync();
    }

    private static async Task WriteAsync(HttpListenerResponse response, int status, string contentType, string body)
    {
        var bytes = Encoding.UTF8.GetBytes(body);
        response.StatusCode = status;
        response.ContentType = contentType;
        response.ContentLength64 = bytes.Length;
        await response.OutputStream.WriteAsync(bytes);
        response.Close();
    }

    private static Task WriteJsonAsync(HttpListenerResponse response, int status, object payload) =>
        WriteAsync(response, status, "application/json", JsonSerializer.Serialize(payload, Json.Options));
}
