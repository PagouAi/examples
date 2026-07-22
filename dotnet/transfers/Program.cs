using Pagou.Examples.Core;
using static Pagou.Examples.Core.Format;

// Pix Out lifecycle with the raw client: create → retrieve/reconcile → cancel.
// The final state (paid / rejected) arrives via the transfer webhook family;
// reconcile with GET when you need certainty. Note `amount` is a numeric cents
// value on input but a decimal string on responses.
// Run: dotnet run --project transfers
try
{
    var client = new PagouHttpClient();

    var externalRef = $"payout_{DemoData.Now()}";
    var input = new CreateTransferInput
    {
        PixKeyType = "EMAIL",
        PixKeyValue = "supplier@example.com",
        Amount = 5000, // R$50.00 in cents (minimum is 1000)
        Description = "Supplier payout",
        ExternalRef = externalRef,
    };

    var created = (await client.RequestDataAsync<Transfer>(new RequestParams
    {
        Method = HttpMethod.Post,
        Path = "/v2/transfers",
        Body = input,
        IdempotencyKey = IdempotencyKey("transfer", externalRef),
    })).Data;
    Console.WriteLine($"Transfer {created.Id} — {created.Status} — amount(cents)={created.Amount}");

    // Reconcile: re-read the current state before acting on it.
    var current = (await client.RequestDataAsync<Transfer>(new RequestParams
    {
        Method = HttpMethod.Get,
        Path = $"/v2/transfers/{created.Id}",
    })).Data;
    PrintResult("Current state", new { id = current.Id, status = current.Status, fee = current.Fee });

    if (!TransferStatuses.Cancelable.Contains(current.Status))
    {
        Console.WriteLine($"Status {current.Status} is not cancelable; the final state will arrive by webhook.");
        return;
    }

    try
    {
        var canceled = (await client.RequestDataAsync<Transfer>(new RequestParams
        {
            Method = HttpMethod.Post,
            Path = $"/v2/transfers/{created.Id}/cancel",
            Body = new { reason = "wrong recipient" },
        })).Data;
        Console.WriteLine($"Canceled {canceled.Id} — {canceled.Status}");
    }
    catch (ConflictException)
    {
        Console.Error.WriteLine("Already progressed past a cancelable state — reconcile via webhook/GET.");
    }
}
catch (Exception error)
{
    Console.Error.WriteLine(error);
    Environment.Exit(1);
}
