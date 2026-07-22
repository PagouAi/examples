using Pagou.Examples.Core;
using Pagou.Examples.Subscriptions;
using static Pagou.Examples.Core.Format;

// End-to-end subscription lifecycle with the raw client:
//   create/reuse customer → create subscription → retrieve → cancel.
// Renewal / failure / past-due / cancellation are delivered as webhooks
// (see ../webhooks); business state changes only on those confirmed events.
// Run: PAGOU_CARD_TOKEN=pgct_... dotnet run --project subscriptions
try
{
    var token = Environment.GetEnvironmentVariable("PAGOU_CARD_TOKEN");
    if (string.IsNullOrEmpty(token))
    {
        throw new InvalidOperationException(
            "Set PAGOU_CARD_TOKEN to a pgct_ token from the Payment Element (subscription mode).");
    }

    var client = new PagouHttpClient();

    var customer = await Customers.CreateOrReuseAsync(client);
    Console.WriteLine($"Customer {customer.Id} ({customer.Email})");

    var input = new CreateSubscriptionInput
    {
        CustomerId = customer.Id,
        PaymentMethod = "credit_card",
        Token = token,
        Interval = "month",
        IntervalCount = 1,
        Amount = 4900,
        Currency = "BRL",
        FailurePolicy = "retry_then_cancel",
        RetryOffsetsDays = new[] { 1, 3, 7 },
        Products = new[] { new ProductInput { Name = "Pro Plan", Price = 4900 } },
    };

    var sub = (await client.RequestDataAsync<Subscription>(new RequestParams
    {
        Method = HttpMethod.Post,
        Path = "/v2/subscriptions",
        Body = input,
        // Idempotent create: a retry reuses the same subscription instead of a duplicate.
        IdempotencyKey = IdempotencyKey("sub_create", customer.Id),
    })).Data;
    Console.WriteLine($"Subscription {sub.Id} — {sub.Status} — {FormatAmount(sub.Amount, sub.Currency)}/month");

    var fetched = (await client.RequestDataAsync<Subscription>(new RequestParams
    {
        Method = HttpMethod.Get,
        Path = $"/v2/subscriptions/{sub.Id}",
    })).Data;
    PrintResult("Billed transactions", fetched.Transactions ?? new List<SubscriptionTransaction>());

    var canceled = (await client.RequestDataAsync<Subscription>(new RequestParams
    {
        Method = HttpMethod.Post,
        Path = $"/v2/subscriptions/{sub.Id}/cancel",
        Body = new { reason = "user_requested" },
    })).Data;
    Console.WriteLine(
        $"Canceled {canceled.Id}: cancelAtPeriodEnd={canceled.CancelAtPeriodEnd}, canceledAt={canceled.CanceledAt}");
}
catch (Exception error)
{
    Console.Error.WriteLine(error);
    Environment.Exit(1);
}
