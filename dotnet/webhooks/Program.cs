using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pagou.Examples.Core;
using Pagou.Examples.Core.Webhooks;

// Webhook receiver for the three event families. It follows the rules every
// handler must: parse the envelope, require the event id, dedupe redeliveries,
// answer 2xx immediately, and offload the slow reconciliation. Business state
// is updated only inside the offloaded processor, only on confirmed events.
// Run: dotnet run --project webhooks   (POST envelopes to http://localhost:4000/webhooks/pagou)
var port = int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var p) ? p : 4000;

var store = new WebhookStore();
var processor = new WebhookProcessor(new PagouHttpClient(), store);

using var listener = new HttpListener();
listener.Prefixes.Add($"http://localhost:{port}/");
listener.Start();
Log.Info($"Webhook receiver on http://localhost:{port}/webhooks/pagou");

while (true)
{
    var context = await listener.GetContextAsync();
    _ = HandleAsync(context);
}

async Task HandleAsync(HttpListenerContext context)
{
    var request = context.Request;
    var response = context.Response;

    if (request.HttpMethod != "POST" || request.Url?.AbsolutePath != "/webhooks/pagou")
    {
        await Reply(response, 404, new { error = "not_found" });
        return;
    }

    JsonNode? parsedBody;
    try
    {
        using var reader = new StreamReader(request.InputStream, request.ContentEncoding);
        parsedBody = JsonNode.Parse(await reader.ReadToEndAsync());
    }
    catch (JsonException)
    {
        await Reply(response, 400, new { error = "invalid_json" });
        return;
    }

    var parsed = WebhookParser.Parse(parsedBody);
    if (parsed.IsError)
    {
        // Documented ingestion error for a missing event id.
        await Reply(response, parsed.Error == "missing_event_id" ? 400 : 422, new { error = parsed.Error });
        return;
    }

    var evt = parsed.Event!;

    // Dedupe synchronously: a redelivery is acknowledged without reprocessing.
    if (!store.MarkProcessed(evt.Id))
    {
        Log.Info($"Duplicate delivery ignored: {evt.Id} ({evt.EventType})");
        await Reply(response, 200, new { received = true });
        return;
    }

    // Ack fast (fulfilling the "respond 2xx quickly" rule), then offload the
    // reconciliation so a slow API call never delays the response or risks a retry.
    await Reply(response, 200, new { received = true });
    _ = Task.Run(async () =>
    {
        try
        {
            await processor.ProcessEventAsync(evt);
        }
        catch (Exception error)
        {
            Log.Error($"Deferred processing failed for {evt.Id}", new { message = error.Message });
        }
    });
}

static async Task Reply(HttpListenerResponse response, int status, object body)
{
    var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(body, Json.Options));
    response.StatusCode = status;
    response.ContentType = "application/json";
    response.ContentLength64 = bytes.Length;
    await response.OutputStream.WriteAsync(bytes);
    response.Close();
}
