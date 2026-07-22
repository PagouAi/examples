using System.Text.Json.Serialization;

namespace Pagou.Examples.Core;

// On-the-wire types for the Pagou API v2, transcribed from the OpenAPI schema.
// The envelope keys are camelCase (`requestId`) while most resource bodies are
// snake_case; a few resources (subscriptions) serialize camelCase. The
// [JsonPropertyName] on each field matches exactly what the API returns.

// --- Payments ---

public sealed class Document
{
    [JsonPropertyName("type")] public required string Type { get; init; }
    [JsonPropertyName("number")] public required string Number { get; init; }
}

public sealed class Buyer
{
    [JsonPropertyName("name")] public string? Name { get; init; }
    [JsonPropertyName("email")] public string? Email { get; init; }
    [JsonPropertyName("phone")] public string? Phone { get; init; }
    [JsonPropertyName("document")] public Document? Document { get; init; }
}

public sealed class ProductInput
{
    [JsonPropertyName("name")] public required string Name { get; init; }
    [JsonPropertyName("price")] public required int Price { get; init; } // cents
    [JsonPropertyName("quantity")] public int? Quantity { get; init; }
}

public sealed class CreateTransactionInput
{
    [JsonPropertyName("amount")] public required int Amount { get; init; } // cents
    [JsonPropertyName("method")] public required string Method { get; init; } // pix | voucher | credit_card
    [JsonPropertyName("currency")] public string? Currency { get; init; }
    [JsonPropertyName("buyer")] public required Buyer Buyer { get; init; }
    [JsonPropertyName("products")] public required IReadOnlyList<ProductInput> Products { get; init; }
    [JsonPropertyName("external_ref")] public string? ExternalRef { get; init; }
    [JsonPropertyName("installments")] public int? Installments { get; init; }
    [JsonPropertyName("token")] public string? Token { get; init; } // pgct_ / pgpm_ card token, credit_card only
    [JsonPropertyName("notify_url")] public string? NotifyUrl { get; init; }
}

public sealed class PixBlock
{
    [JsonPropertyName("qr_code")] public string? QrCode { get; init; } // EMV copy-and-paste payload
    [JsonPropertyName("expiration_date")] public string? ExpirationDate { get; init; }
    [JsonPropertyName("end_to_end_id")] public string? EndToEndId { get; init; }
    [JsonPropertyName("receipt_url")] public string? ReceiptUrl { get; init; }
}

public sealed class VoucherBlock
{
    [JsonPropertyName("barcode")] public string? Barcode { get; init; }
    [JsonPropertyName("digitable_line")] public string? DigitableLine { get; init; }
    [JsonPropertyName("url")] public string? Url { get; init; } // hosted boleto / PDF
    [JsonPropertyName("expiration_date")] public string? ExpirationDate { get; init; }
    [JsonPropertyName("instructions")] public string? Instructions { get; init; }
    [JsonPropertyName("receipt_url")] public string? ReceiptUrl { get; init; }
}

public sealed class NextAction
{
    [JsonPropertyName("type")] public string? Type { get; init; } // three_ds_challenge
    [JsonPropertyName("challenge_session_id")] public string? ChallengeSessionId { get; init; }
    [JsonPropertyName("client_secret")] public string? ClientSecret { get; init; }
    [JsonPropertyName("expires_at")] public string? ExpiresAt { get; init; }
}

public sealed class TransactionFee
{
    [JsonPropertyName("net_amount")] public int NetAmount { get; init; }
    [JsonPropertyName("estimated_fee")] public int EstimatedFee { get; init; }
}

public sealed class Transaction
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("amount")] public int Amount { get; init; }
    [JsonPropertyName("currency")] public string Currency { get; init; } = "BRL";
    [JsonPropertyName("method")] public string Method { get; init; } = "";
    [JsonPropertyName("status")] public string Status { get; init; } = "";
    [JsonPropertyName("paid_amount")] public int PaidAmount { get; init; }
    [JsonPropertyName("refunded_amount")] public int RefundedAmount { get; init; }
    [JsonPropertyName("paid_at")] public string? PaidAt { get; init; }
    [JsonPropertyName("fee")] public TransactionFee? Fee { get; init; }
    [JsonPropertyName("created_at")] public string? CreatedAt { get; init; }
    [JsonPropertyName("updated_at")] public string? UpdatedAt { get; init; }
    [JsonPropertyName("pix")] public PixBlock? Pix { get; init; }
    [JsonPropertyName("voucher")] public VoucherBlock? Voucher { get; init; }
    [JsonPropertyName("next_action")] public NextAction? NextAction { get; init; }
}

public sealed class RefundResult
{
    [JsonPropertyName("message")] public string Message { get; init; } = "";
    [JsonPropertyName("amount_refunded")] public int AmountRefunded { get; init; }
    [JsonPropertyName("remaining_balance")] public int RemainingBalance { get; init; }
    [JsonPropertyName("is_full_refund")] public bool IsFullRefund { get; init; }
}

public sealed class TransactionPayment
{
    [JsonPropertyName("method")] public string Method { get; init; } = "";
    [JsonPropertyName("currency")] public string Currency { get; init; } = "BRL";
    [JsonPropertyName("amount")] public int Amount { get; init; }
    [JsonPropertyName("base_price")] public int BasePrice { get; init; }
}

public sealed class TransactionListItem
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("status")] public string Status { get; init; } = "";
    [JsonPropertyName("payment")] public TransactionPayment? Payment { get; init; }
    [JsonPropertyName("created_at")] public string? CreatedAt { get; init; }
}

// --- Customers ---

public sealed class CreateCustomerInput
{
    [JsonPropertyName("name")] public required string Name { get; init; }
    [JsonPropertyName("email")] public required string Email { get; init; }
    [JsonPropertyName("document")] public required Document Document { get; init; }
    [JsonPropertyName("phone")] public string? Phone { get; init; }
    [JsonPropertyName("externalRef")] public string? ExternalRef { get; init; }
}

public sealed class Customer
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("name")] public string Name { get; init; } = "";
    [JsonPropertyName("email")] public string Email { get; init; } = "";
    [JsonPropertyName("phone")] public string? Phone { get; init; }
    [JsonPropertyName("externalRef")] public string? ExternalRef { get; init; }
}

// --- Subscriptions (responses serialize camelCase) ---

public sealed class CreateSubscriptionInput
{
    [JsonPropertyName("customer_id")] public required string CustomerId { get; init; }
    [JsonPropertyName("payment_method")] public string? PaymentMethod { get; init; }
    [JsonPropertyName("token")] public required string Token { get; init; } // pgct_ single-use card token
    [JsonPropertyName("interval")] public required string Interval { get; init; } // day | week | month
    [JsonPropertyName("interval_count")] public int? IntervalCount { get; init; }
    [JsonPropertyName("amount")] public required int Amount { get; init; }
    [JsonPropertyName("currency")] public string? Currency { get; init; }
    [JsonPropertyName("failure_policy")] public string? FailurePolicy { get; init; }
    [JsonPropertyName("retry_offsets_days")] public IReadOnlyList<int>? RetryOffsetsDays { get; init; }
    [JsonPropertyName("products")] public IReadOnlyList<ProductInput>? Products { get; init; }
    [JsonPropertyName("trial_end")] public string? TrialEnd { get; init; }
}

public sealed class SubscriptionTransaction
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("status")] public string Status { get; init; } = "";
    [JsonPropertyName("amount")] public int Amount { get; init; }
    [JsonPropertyName("paidAt")] public string? PaidAt { get; init; }
}

public sealed class Subscription
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("customerId")] public string CustomerId { get; init; } = "";
    [JsonPropertyName("status")] public string Status { get; init; } = "";
    [JsonPropertyName("interval")] public string Interval { get; init; } = "";
    [JsonPropertyName("intervalCount")] public int IntervalCount { get; init; }
    [JsonPropertyName("amount")] public int Amount { get; init; }
    [JsonPropertyName("currency")] public string Currency { get; init; } = "BRL";
    [JsonPropertyName("currentPeriodStart")] public string? CurrentPeriodStart { get; init; }
    [JsonPropertyName("currentPeriodEnd")] public string? CurrentPeriodEnd { get; init; }
    [JsonPropertyName("cancelAtPeriodEnd")] public bool CancelAtPeriodEnd { get; init; }
    [JsonPropertyName("canceledAt")] public string? CanceledAt { get; init; }
    [JsonPropertyName("cancellationReason")] public string? CancellationReason { get; init; }
    [JsonPropertyName("customerEmail")] public string? CustomerEmail { get; init; }
    [JsonPropertyName("cardLast4")] public string? CardLast4 { get; init; }
    [JsonPropertyName("transactions")] public IReadOnlyList<SubscriptionTransaction>? Transactions { get; init; }
    [JsonPropertyName("createdAt")] public string? CreatedAt { get; init; }
    [JsonPropertyName("updatedAt")] public string? UpdatedAt { get; init; }
}

// --- Transfers (Pix Out) ---

public sealed class CreateTransferInput
{
    [JsonPropertyName("pix_key_type")] public required string PixKeyType { get; init; } // CPF|CNPJ|EMAIL|PHONE|EVP
    [JsonPropertyName("pix_key_value")] public required string PixKeyValue { get; init; }
    [JsonPropertyName("amount")] public required int Amount { get; init; } // cents, min 1000
    [JsonPropertyName("description")] public string? Description { get; init; }
    [JsonPropertyName("external_ref")] public string? ExternalRef { get; init; }
}

public sealed class Transfer
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("amount")] public string Amount { get; init; } = ""; // decimal string of cents on responses
    [JsonPropertyName("fee")] public int Fee { get; init; }
    [JsonPropertyName("type")] public string? Type { get; init; }
    [JsonPropertyName("pix_key")] public string? PixKey { get; init; }
    [JsonPropertyName("pix_key_type")] public string? PixKeyType { get; init; }
    [JsonPropertyName("status")] public string Status { get; init; } = "";
    [JsonPropertyName("description")] public string? Description { get; init; }
    [JsonPropertyName("external_ref")] public string? ExternalRef { get; init; }
    [JsonPropertyName("processed_at")] public string? ProcessedAt { get; init; }
    [JsonPropertyName("transferred_at")] public string? TransferredAt { get; init; }
    [JsonPropertyName("created_at")] public string? CreatedAt { get; init; }
    [JsonPropertyName("updated_at")] public string? UpdatedAt { get; init; }
}

// --- Checkout links ---

public sealed class CheckoutLinkProduct
{
    [JsonPropertyName("external_id")] public required string ExternalId { get; init; }
    [JsonPropertyName("name")] public required string Name { get; init; }
    [JsonPropertyName("price")] public required int Price { get; init; }
    [JsonPropertyName("quantity")] public int? Quantity { get; init; }
    [JsonPropertyName("type")] public string? Type { get; init; } // physical | digital
}

public sealed class CreateCheckoutLinkInput
{
    [JsonPropertyName("amount")] public int? Amount { get; init; }
    [JsonPropertyName("currency")] public string? Currency { get; init; }
    [JsonPropertyName("title")] public string? Title { get; init; }
    [JsonPropertyName("products")] public required IReadOnlyList<CheckoutLinkProduct> Products { get; init; }
}

public sealed class CheckoutLink
{
    [JsonPropertyName("url")] public string Url { get; init; } = "";
}
