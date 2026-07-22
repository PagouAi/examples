using Pagou.Examples.Core;

namespace Pagou.Examples.Subscriptions;

// Customers are created/reused through the raw client so the subscription
// example always has a valid customer id to bill.
public static class Customers
{
    /// <summary>Reuses PAGOU_CUSTOMER_ID when set, otherwise creates a fresh customer.</summary>
    public static async Task<Customer> CreateOrReuseAsync(PagouHttpClient client)
    {
        var existing = Environment.GetEnvironmentVariable("PAGOU_CUSTOMER_ID");
        if (!string.IsNullOrEmpty(existing))
        {
            return (await client.RequestDataAsync<Customer>(new RequestParams
            {
                Method = HttpMethod.Get,
                Path = $"/v2/customers/{existing}",
            })).Data;
        }

        var input = new CreateCustomerInput
        {
            Name = "Ana Souza",
            Email = $"ana.souza+{DemoData.Now()}@example.com",
            Document = new Document { Type = "CPF", Number = "19100000000" },
            Phone = "11999990000",
            ExternalRef = $"cust_{DemoData.Now()}",
        };

        return (await client.RequestDataAsync<Customer>(new RequestParams
        {
            Method = HttpMethod.Post,
            Path = "/v2/customers",
            Body = input,
        })).Data;
    }
}
