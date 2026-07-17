// On-the-wire types for the Pagou API v2, transcribed from the OpenAPI schema.
// The envelope keys are camelCase (`requestId`) while most resource bodies are
// snake_case; a few resources (subscriptions) serialize camelCase. Field casing
// here matches exactly what the API returns.

export type Currency =
  | "ARS" | "BOB" | "BRL" | "CLP" | "COP" | "CRC" | "GTQ" | "MXN" | "PYG" | "PEN" | "USD" | "UYU";

export type PaymentMethod = "pix" | "voucher" | "credit_card";

export type DocumentType =
  | "DNI" | "CUIT" | "CI" | "CE" | "NIT" | "CPF" | "CNPJ" | "RUT" | "RUN"
  | "CC" | "CDI" | "PP" | "RUC" | "PAS" | "DPI" | "CUI" | "RFC" | "CURP";

export type TransactionStatus =
  | "authorized" | "canceled" | "captured" | "chargedback" | "three_ds_required"
  | "expired" | "in_protest" | "paid" | "partially_paid" | "partially_refunded"
  | "pending" | "processing" | "processed" | "refunded" | "med" | "refused";

/** Statuses at which a charge is settled and it is safe to fulfill. */
export const TERMINAL_PAID_STATUSES: ReadonlySet<TransactionStatus> = new Set([
  "paid",
  "captured",
]);

export interface Buyer {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  document?: { type: DocumentType; number: string } | null;
}

export interface ProductInput {
  name: string;
  price: number; // cents
  quantity?: number;
}

export interface CreateTransactionInput {
  amount: number; // cents
  method: PaymentMethod;
  currency?: Currency;
  buyer: Buyer;
  products: ProductInput[];
  external_ref?: string;
  installments?: number;
  token?: string; // pgct_ / pgpm_ card token, credit_card only
  notify_url?: string;
}

export interface PixBlock {
  qr_code: string; // EMV copy-and-paste payload
  expiration_date: string;
  end_to_end_id: string | null;
  receipt_url: string | null;
}

export interface VoucherBlock {
  barcode: string | null;
  digitable_line: string | null;
  url: string | null; // hosted boleto / PDF
  expiration_date: string | null;
  instructions: string | null;
  receipt_url: string | null;
}

export interface NextAction {
  type: "three_ds_challenge";
  challenge_session_id: string;
  client_secret: string;
  expires_at: string;
}

export interface Transaction {
  id: string;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  status: TransactionStatus;
  paid_amount: number;
  refunded_amount: number;
  paid_at: string | null;
  fee: { net_amount: number; estimated_fee: number };
  created_at: string;
  updated_at: string;
  pix?: PixBlock | null;
  voucher?: VoucherBlock | null;
  next_action?: NextAction | null;
}

export interface RefundResult {
  message: string;
  amount_refunded: number;
  remaining_balance: number;
  is_full_refund: boolean;
}

export interface TransactionListItem {
  id: string;
  buyer: { name: string; email: string };
  payment: { method: PaymentMethod; currency: Currency; amount: number; base_price: number };
  status: TransactionStatus;
  created_at: string;
}

// --- Customers ---

export interface CreateCustomerInput {
  name: string;
  email: string;
  document: { type: DocumentType; number: string };
  phone?: string;
  externalRef?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  externalRef?: string | null;
}

// --- Subscriptions ---

export type SubscriptionInterval = "day" | "week" | "month";
export type SubscriptionStatus =
  | "incomplete" | "trialing" | "active" | "past_due" | "cancel_scheduled" | "canceled";
export type SubscriptionFailurePolicy = "immediate_cancel" | "retry_then_cancel";
export type SubscriptionCancellationReason = "user_requested" | "payment_failure" | "chargeback" | "system";

export interface CreateSubscriptionInput {
  customer_id: string;
  payment_method?: "credit_card";
  token: string; // pgct_ single-use card token
  interval: SubscriptionInterval;
  interval_count?: number;
  amount: number;
  currency?: Currency;
  failure_policy?: SubscriptionFailurePolicy;
  retry_offsets_days?: number[];
  products?: ProductInput[];
  trial_end?: string | null;
  idempotency_key?: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  interval: SubscriptionInterval;
  intervalCount: number;
  amount: number;
  currency: Currency;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  cancellationReason: SubscriptionCancellationReason | null;
  customerEmail: string;
  cardLast4: string;
  transactions?: Array<{ id: string; status: string; amount: number; paidAt: string | null }>;
  createdAt: string;
  updatedAt: string | null;
}

// --- Transfers (Pix Out) ---

export type PixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";
export type TransferStatus =
  | "pending" | "scheduled" | "in_analysis" | "processing" | "paid"
  | "rejected" | "cancelled" | "error" | "unknown";

/** Statuses from which a transfer can typically be cancelled. */
export const CANCELABLE_TRANSFER_STATUSES: ReadonlySet<TransferStatus> = new Set([
  "pending",
  "scheduled",
]);

export interface CreateTransferInput {
  pix_key_type: PixKeyType;
  pix_key_value: string;
  amount: number; // cents, min 1000
  description?: string;
  external_ref?: string;
}

export interface Transfer {
  id: string;
  amount: string; // decimal string of cents on responses
  fee: number;
  type: string;
  pix_key: string;
  pix_key_type: string | null;
  status: TransferStatus;
  description: string | null;
  external_ref: string | null;
  processed_at: string | null;
  transferred_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckoutLinkProduct {
  external_id: string;
  name: string;
  price: number;
  quantity?: number;
  type?: "physical" | "digital";
}

export interface CreateCheckoutLinkInput {
  amount?: number;
  currency?: Currency;
  title?: string;
  products: CheckoutLinkProduct[];
}
