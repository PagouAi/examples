package ai.pagou.examples.lib;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Set;

/**
 * On-the-wire types for the Pagou API v2, transcribed from the OpenAPI schema.
 * The envelope keys are camelCase ({@code requestId}) while most resource bodies
 * are snake_case; a few resources (subscriptions) serialize camelCase.
 * {@code @JsonProperty} annotations bind the exact wire casing to idiomatic
 * Java field names.
 */
public final class Models {

  private Models() {}

  /** Statuses at which a charge is settled and it is safe to fulfill. */
  public static final Set<String> TERMINAL_PAID_STATUSES = Set.of("paid", "captured");

  /** Statuses from which a transfer can typically be cancelled. */
  public static final Set<String> CANCELABLE_TRANSFER_STATUSES = Set.of("pending", "scheduled");

  // --- Payments ---

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record Document(String type, String number) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record Buyer(String name, String email, String phone, Document document) {
    public Buyer(String name, String email, Document document) {
      this(name, email, null, document);
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record ProductInput(String name, long price, Integer quantity) {
    public ProductInput(String name, long price) {
      this(name, price, null);
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record CreateTransactionInput(
      long amount,
      String method,
      String currency,
      Buyer buyer,
      List<ProductInput> products,
      @JsonProperty("external_ref") String externalRef,
      Integer installments,
      String token,
      @JsonProperty("notify_url") String notifyUrl) {}

  public record PixBlock(
      @JsonProperty("qr_code") String qrCode,
      @JsonProperty("expiration_date") String expirationDate,
      @JsonProperty("end_to_end_id") String endToEndId,
      @JsonProperty("receipt_url") String receiptUrl) {}

  public record VoucherBlock(
      String barcode,
      @JsonProperty("digitable_line") String digitableLine,
      String url,
      @JsonProperty("expiration_date") String expirationDate,
      String instructions,
      @JsonProperty("receipt_url") String receiptUrl) {}

  public record NextAction(
      String type,
      @JsonProperty("challenge_session_id") String challengeSessionId,
      @JsonProperty("client_secret") String clientSecret,
      @JsonProperty("expires_at") String expiresAt) {}

  public record Fee(
      @JsonProperty("net_amount") long netAmount,
      @JsonProperty("estimated_fee") long estimatedFee) {}

  public record Transaction(
      String id,
      long amount,
      String currency,
      String method,
      String status,
      @JsonProperty("paid_amount") long paidAmount,
      @JsonProperty("refunded_amount") long refundedAmount,
      @JsonProperty("paid_at") String paidAt,
      Fee fee,
      @JsonProperty("created_at") String createdAt,
      @JsonProperty("updated_at") String updatedAt,
      PixBlock pix,
      VoucherBlock voucher,
      @JsonProperty("next_action") NextAction nextAction) {}

  public record RefundResult(
      String message,
      @JsonProperty("amount_refunded") long amountRefunded,
      @JsonProperty("remaining_balance") long remainingBalance,
      @JsonProperty("is_full_refund") boolean isFullRefund) {}

  public record TransactionListItem(
      String id, TransactionListBuyer buyer, TransactionListPayment payment, String status,
      @JsonProperty("created_at") String createdAt) {}

  public record TransactionListBuyer(String name, String email) {}

  public record TransactionListPayment(String method, String currency, long amount,
      @JsonProperty("base_price") long basePrice) {}

  // --- Customers ---

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record CreateCustomerInput(
      String name, String email, Document document, String phone, String externalRef) {}

  public record Customer(String id, String name, String email, String phone, String externalRef) {}

  // --- Subscriptions ---

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record CreateSubscriptionInput(
      @JsonProperty("customer_id") String customerId,
      @JsonProperty("payment_method") String paymentMethod,
      String token,
      String interval,
      @JsonProperty("interval_count") Integer intervalCount,
      long amount,
      String currency,
      @JsonProperty("failure_policy") String failurePolicy,
      @JsonProperty("retry_offsets_days") List<Integer> retryOffsetsDays,
      List<ProductInput> products) {}

  public record SubscriptionTransaction(String id, String status, long amount,
      @JsonProperty("paidAt") String paidAt) {}

  public record Subscription(
      String id,
      String customerId,
      String status,
      String interval,
      Integer intervalCount,
      long amount,
      String currency,
      String currentPeriodStart,
      String currentPeriodEnd,
      boolean cancelAtPeriodEnd,
      String canceledAt,
      String cancellationReason,
      String customerEmail,
      String cardLast4,
      List<SubscriptionTransaction> transactions,
      String createdAt,
      String updatedAt) {}

  // --- Transfers (Pix Out) ---

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record CreateTransferInput(
      @JsonProperty("pix_key_type") String pixKeyType,
      @JsonProperty("pix_key_value") String pixKeyValue,
      long amount,
      String description,
      @JsonProperty("external_ref") String externalRef) {}

  public record Transfer(
      String id,
      String amount,
      long fee,
      String type,
      @JsonProperty("pix_key") String pixKey,
      @JsonProperty("pix_key_type") String pixKeyType,
      String status,
      String description,
      @JsonProperty("external_ref") String externalRef,
      @JsonProperty("processed_at") String processedAt,
      @JsonProperty("transferred_at") String transferredAt,
      @JsonProperty("created_at") String createdAt,
      @JsonProperty("updated_at") String updatedAt) {}

  // --- Checkout links ---

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record CheckoutLinkProduct(
      @JsonProperty("external_id") String externalId,
      String name,
      long price,
      Integer quantity,
      String type) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record CreateCheckoutLinkInput(
      Long amount, String currency, String title, List<CheckoutLinkProduct> products) {}
}
