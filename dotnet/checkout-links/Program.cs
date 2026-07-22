using Pagou.Examples.Core;
using static Pagou.Examples.Core.Format;

// Creates a hosted checkout link. The v2 contract exposes only POST — the
// returned public identifier is the checkout URL itself (`data.url`); persist
// it to share with the buyer. There is no retrieve/list endpoint.
// Run: dotnet run --project checkout-links
try
{
    var client = new PagouHttpClient();

    var input = new CreateCheckoutLinkInput
    {
        Title = "Pro Plan",
        Currency = "BRL",
        Products = new[]
        {
            new CheckoutLinkProduct { ExternalId = "pro-plan", Name = "Pro Plan", Price = 4900, Quantity = 1, Type = "digital" },
        },
    };

    var link = (await client.RequestDataAsync<CheckoutLink>(new RequestParams
    {
        Method = HttpMethod.Post,
        Path = "/v2/checkout-links",
        Body = input,
    })).Data;

    // Persist the URL — it is the only handle to the link.
    PrintResult("Checkout link (store this URL)", link.Url);
}
catch (Exception error)
{
    Console.Error.WriteLine(error);
    Environment.Exit(1);
}
