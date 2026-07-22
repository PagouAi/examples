using Pagou.Examples.Core;
using static Pagou.Examples.Core.DemoData;
using static Pagou.Examples.Core.Format;

namespace Pagou.Examples.Payments;

/// <summary>
/// The payments flow: Pix + QR, voucher/boleto, card (Payment Element → pgct_ →
/// backend → 3DS), reconcile, full/partial refund and cursor pagination. Each
/// method is the backend half of one operation; the runnable Program dispatches to it.
/// </summary>
public static class PaymentsFlows
{
    // Creates a Pix charge and returns the copy-and-paste QR payload (`pix.qr_code`).
    public static async Task CreatePixAsync()
    {
        var client = new PagouHttpClient();

        var input = new CreateTransactionInput
        {
            Amount = 4900,
            Method = "pix",
            Currency = "BRL",
            Buyer = DemoBuyer,
            Products = DemoProducts,
            // `external_ref` doubles as a natural idempotency key: a duplicate value
            // is rejected with 409 DUPLICATE_EXTERNAL_REF instead of double-charging.
            ExternalRef = $"order_{Now()}",
        };

        try
        {
            var tx = (await client.RequestDataAsync<Transaction>(new RequestParams
            {
                Method = HttpMethod.Post,
                Path = "/v2/transactions",
                Body = input,
            })).Data;

            Console.WriteLine($"Created {tx.Id} — {tx.Status} — {FormatAmount(tx.Amount, tx.Currency)}");
            PrintResult("Pix QR (copy and paste)", tx.Pix?.QrCode);
            PrintResult("Expires at", tx.Pix?.ExpirationDate);
        }
        catch (ConflictException)
        {
            Console.Error.WriteLine("Duplicate external_ref — this charge was already created.");
        }
    }

    // Creates a voucher (boleto) charge. The printable instructions arrive
    // asynchronously: the create response may return `status: pending` with the
    // `voucher` block populated once the instrument is issued. Reconcile with a
    // GET or a webhook to obtain the final barcode / digitable line / PDF URL.
    public static async Task CreateVoucherAsync()
    {
        var client = new PagouHttpClient();

        var input = new CreateTransactionInput
        {
            Amount = 4900,
            Method = "voucher",
            Currency = "BRL",
            Buyer = DemoBuyer,
            Products = DemoProducts,
            ExternalRef = $"voucher_{Now()}",
        };

        var tx = (await client.RequestDataAsync<Transaction>(new RequestParams
        {
            Method = HttpMethod.Post,
            Path = "/v2/transactions",
            Body = input,
        })).Data;

        Console.WriteLine($"Created {tx.Id} — {tx.Status} — {FormatAmount(tx.Amount, tx.Currency)}");
        if (tx.Voucher?.Barcode is not null || tx.Voucher?.Url is not null)
        {
            PrintResult("Voucher instructions", tx.Voucher);
        }
        else
        {
            Console.WriteLine($"Instructions not ready yet — reconcile {tx.Id} via GET or wait for the webhook.");
        }
    }

    // Backend half of the card flow. The `pgct_*` token is produced in the browser
    // by the Payment Element (see card-element) and posted to your server; it is
    // the ONLY card credential your backend ever sees — never a PAN or CVV.
    public static async Task CreateCardAsync(string[] rest)
    {
        var token = rest.Length > 0 ? rest[0] : Environment.GetEnvironmentVariable("PAGOU_CARD_TOKEN");
        if (string.IsNullOrEmpty(token))
        {
            throw new InvalidOperationException(
                "Provide a pgct_ token from the Payment Element (arg 1 or PAGOU_CARD_TOKEN). " +
                "Start the browser demo with: dotnet run --project payments -- card-server");
        }

        var client = new PagouHttpClient();
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

        Console.WriteLine($"Created {tx.Id} — {tx.Status} — {FormatAmount(tx.Amount, tx.Currency)}");

        if (tx.Status == "three_ds_required" && tx.NextAction is not null)
        {
            // 3DS: return `next_action` to the browser so the Payment Element can open
            // the challenge. Do NOT fulfill here — wait for the confirmed webhook.
            PrintResult("next_action (return to the browser to continue 3DS)", tx.NextAction);
            return;
        }

        Console.WriteLine("No 3DS challenge required. Confirm the final state via webhook or reconciliation.");
    }

    // Retrieves a transaction by its public UUID.
    public static async Task RetrieveAsync(string[] rest)
    {
        var id = ResourceIdFromArgs(rest, "PAGOU_TRANSACTION_ID");
        var client = new PagouHttpClient();

        try
        {
            var tx = (await client.RequestDataAsync<Transaction>(new RequestParams
            {
                Method = HttpMethod.Get,
                Path = $"/v2/transactions/{id}",
            })).Data;

            PrintResult("Transaction", new
            {
                id = tx.Id,
                status = tx.Status,
                amount = tx.Amount,
                paid_amount = tx.PaidAmount,
                refunded_amount = tx.RefundedAmount,
                paid_at = tx.PaidAt,
            });
        }
        catch (NotFoundException)
        {
            Console.Error.WriteLine($"No transaction {id}.");
        }
    }

    // Reconciles a transaction against the API and prints the fulfillment decision.
    // This is the safe pattern behind every webhook: trust the API, not the event.
    public static async Task ReconcileAsync(string[] rest)
    {
        var id = ResourceIdFromArgs(rest, "PAGOU_TRANSACTION_ID");
        var result = await Reconciler.ReconcileTransactionAsync(id, new PagouHttpClient());

        if (result is null)
        {
            Console.Error.WriteLine($"No transaction {id}.");
            return;
        }

        var (transaction, decision) = result.Value;
        Console.WriteLine($"Transaction {transaction.Id} is {transaction.Status} → decision: {decision}");
        switch (decision)
        {
            case FulfillmentDecision.Fulfill:
                Console.WriteLine("Safe to deliver: the charge is settled.");
                break;
            case FulfillmentDecision.Wait:
                Console.WriteLine("Not settled yet: keep the order pending and reconcile again later.");
                break;
            default:
                Console.WriteLine("Failed/expired: release the order.");
                break;
        }
    }

    // Refunds a transaction. Omit the amount for a full refund; pass cents for a
    // partial one. The refund is idempotent via an Idempotency-Key so a retry after
    // a network blip never double-refunds.
    public static async Task RefundAsync(string[] rest)
    {
        var id = ResourceIdFromArgs(rest, "PAGOU_TRANSACTION_ID");
        var amount = rest.Length > 1 && int.TryParse(rest[1], out var cents) ? (int?)cents : null;
        var client = new PagouHttpClient();

        try
        {
            object body = amount is not null
                ? new { amount, reason = "requested_by_customer" }
                : new { reason = "requested_by_customer" };

            var refund = (await client.RequestDataAsync<RefundResult>(new RequestParams
            {
                Method = HttpMethod.Put,
                Path = $"/v2/transactions/{id}/refund",
                Body = body,
                IdempotencyKey = IdempotencyKey("refund", $"{id}_{amount?.ToString() ?? "full"}"),
            })).Data;

            Console.WriteLine(refund.IsFullRefund ? "Full refund processed." : "Partial refund processed.");
            PrintResult("Refund", new
            {
                amount_refunded = FormatAmount(refund.AmountRefunded),
                remaining_balance = FormatAmount(refund.RemainingBalance),
            });
        }
        catch (InvalidRequestException error)
        {
            Console.Error.WriteLine($"Refund rejected: {error.Message}");
        }
    }

    // Lists transactions with cursor pagination. Filters use camelCase query names
    // (`paymentMethods`), while the envelope cursors are snake_case
    // (`next_cursor` / `prev_cursor`). Walks up to three pages forward.
    public static async Task ListAsync()
    {
        var client = new PagouHttpClient();
        string? cursor = null;

        for (var pageNum = 1; pageNum <= 3; pageNum++)
        {
            var query = new Dictionary<string, object?>
            {
                ["limit"] = 5,
                ["paymentMethods"] = new[] { "pix", "credit_card" },
            };
            if (cursor is not null)
            {
                query["cursor"] = cursor;
                query["direction"] = "next";
            }

            var page = (await client.RequestCursorPageAsync<TransactionListItem>(new RequestParams
            {
                Method = HttpMethod.Get,
                Path = "/v2/transactions",
                Query = query,
            })).Data;

            Console.WriteLine($"\nPage {pageNum} — {page.Data.Count} of {page.Total} total");
            foreach (var item in page.Data)
            {
                Console.WriteLine($"  {item.Id}  {item.Status,-18}  {item.Payment?.Method}  {item.Payment?.Amount}");
            }

            if (page.NextCursor is null)
            {
                Console.WriteLine("\nNo more pages.");
                break;
            }
            cursor = page.NextCursor;
        }
    }

    // Sandbox-only helper: forces a transaction to a target status so you can
    // exercise the paid/refunded paths without a real payer. Never available in production.
    public static async Task SandboxAdvanceAsync(string[] rest)
    {
        var id = ResourceIdFromArgs(rest, "PAGOU_TRANSACTION_ID");
        var status = rest.Length > 1 ? rest[1] : "paid";
        var client = new PagouHttpClient();

        var updated = (await client.RequestDataAsync<SandboxUpdate>(new RequestParams
        {
            Method = HttpMethod.Put,
            Path = $"/v2/transactions/{id}",
            Body = new { status },
        })).Data;

        PrintResult("Sandbox transaction updated", updated.Transaction);
    }

    private sealed class SandboxUpdate
    {
        public SandboxTransaction? Transaction { get; init; }
    }

    private sealed class SandboxTransaction
    {
        public string Id { get; init; } = "";
        public string Status { get; init; } = "";
    }
}
