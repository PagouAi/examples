package pagou

// On-the-wire types for the Pagou API v2, transcribed from the OpenAPI schema.
// The envelope keys are camelCase (requestId) while most resource bodies are
// snake_case; a few resources (subscriptions) serialize camelCase. The JSON
// tags here match exactly what the API returns.

type Currency string

type PaymentMethod string

const (
	MethodPix        PaymentMethod = "pix"
	MethodVoucher    PaymentMethod = "voucher"
	MethodCreditCard PaymentMethod = "credit_card"
)

type DocumentType string

type TransactionStatus string

// terminalPaidStatuses are the statuses at which a charge is settled and it is
// safe to fulfill.
var terminalPaidStatuses = map[TransactionStatus]struct{}{
	"paid": {}, "captured": {},
}

type Document struct {
	Type   DocumentType `json:"type"`
	Number string       `json:"number"`
}

type Buyer struct {
	Name     string    `json:"name,omitempty"`
	Email    string    `json:"email,omitempty"`
	Phone    string    `json:"phone,omitempty"`
	Document *Document `json:"document,omitempty"`
}

type ProductInput struct {
	Name     string `json:"name"`
	Price    int    `json:"price"` // cents
	Quantity int    `json:"quantity,omitempty"`
}

type CreateTransactionInput struct {
	Amount       int            `json:"amount"` // cents
	Method       PaymentMethod  `json:"method"`
	Currency     Currency       `json:"currency,omitempty"`
	Buyer        Buyer          `json:"buyer"`
	Products     []ProductInput `json:"products"`
	ExternalRef  string         `json:"external_ref,omitempty"`
	Installments int            `json:"installments,omitempty"`
	Token        string         `json:"token,omitempty"` // pgct_/pgpm_ card token, credit_card only
	NotifyURL    string         `json:"notify_url,omitempty"`
}

type PixBlock struct {
	QRCode         string  `json:"qr_code"` // EMV copy-and-paste payload
	ExpirationDate string  `json:"expiration_date"`
	EndToEndID     *string `json:"end_to_end_id"`
	ReceiptURL     *string `json:"receipt_url"`
}

type VoucherBlock struct {
	Barcode        *string `json:"barcode"`
	DigitableLine  *string `json:"digitable_line"`
	URL            *string `json:"url"` // hosted boleto / PDF
	ExpirationDate *string `json:"expiration_date"`
	Instructions   *string `json:"instructions"`
	ReceiptURL     *string `json:"receipt_url"`
}

type NextAction struct {
	Type               string `json:"type"`
	ChallengeSessionID string `json:"challenge_session_id"`
	ClientSecret       string `json:"client_secret"`
	ExpiresAt          string `json:"expires_at"`
}

type Fee struct {
	NetAmount    int `json:"net_amount"`
	EstimatedFee int `json:"estimated_fee"`
}

type Transaction struct {
	ID             string            `json:"id"`
	Amount         int               `json:"amount"`
	Currency       Currency          `json:"currency"`
	Method         PaymentMethod     `json:"method"`
	Status         TransactionStatus `json:"status"`
	PaidAmount     int               `json:"paid_amount"`
	RefundedAmount int               `json:"refunded_amount"`
	PaidAt         *string           `json:"paid_at"`
	Fee            Fee               `json:"fee"`
	CreatedAt      string            `json:"created_at"`
	UpdatedAt      string            `json:"updated_at"`
	Pix            *PixBlock         `json:"pix,omitempty"`
	Voucher        *VoucherBlock     `json:"voucher,omitempty"`
	NextAction     *NextAction       `json:"next_action,omitempty"`
}

type RefundResult struct {
	Message          string `json:"message"`
	AmountRefunded   int    `json:"amount_refunded"`
	RemainingBalance int    `json:"remaining_balance"`
	IsFullRefund     bool   `json:"is_full_refund"`
}

type TransactionListItem struct {
	ID    string `json:"id"`
	Buyer struct {
		Name  string `json:"name"`
		Email string `json:"email"`
	} `json:"buyer"`
	Payment struct {
		Method    PaymentMethod `json:"method"`
		Currency  Currency      `json:"currency"`
		Amount    int           `json:"amount"`
		BasePrice int           `json:"base_price"`
	} `json:"payment"`
	Status    TransactionStatus `json:"status"`
	CreatedAt string            `json:"created_at"`
}

// --- Customers ---

type CreateCustomerInput struct {
	Name        string   `json:"name"`
	Email       string   `json:"email"`
	Document    Document `json:"document"`
	Phone       string   `json:"phone,omitempty"`
	ExternalRef string   `json:"externalRef,omitempty"`
}

type Customer struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Email       string  `json:"email"`
	Phone       *string `json:"phone"`
	ExternalRef *string `json:"externalRef"`
}

// --- Subscriptions ---

type SubscriptionInterval string

type SubscriptionStatus string

type CreateSubscriptionInput struct {
	CustomerID      string               `json:"customer_id"`
	PaymentMethod   string               `json:"payment_method,omitempty"`
	Token           string               `json:"token"` // pgct_ single-use card token
	Interval        SubscriptionInterval `json:"interval"`
	IntervalCount   int                  `json:"interval_count,omitempty"`
	Amount          int                  `json:"amount"`
	Currency        Currency             `json:"currency,omitempty"`
	FailurePolicy   string               `json:"failure_policy,omitempty"`
	RetryOffsetDays []int                `json:"retry_offsets_days,omitempty"`
	Products        []ProductInput       `json:"products,omitempty"`
	TrialEnd        *string              `json:"trial_end,omitempty"`
	IdempotencyKey  string               `json:"idempotency_key,omitempty"`
}

type SubscriptionTransaction struct {
	ID     string  `json:"id"`
	Status string  `json:"status"`
	Amount int     `json:"amount"`
	PaidAt *string `json:"paidAt"`
}

type Subscription struct {
	ID                 string                    `json:"id"`
	CustomerID         string                    `json:"customerId"`
	Status             SubscriptionStatus        `json:"status"`
	Interval           SubscriptionInterval      `json:"interval"`
	IntervalCount      int                       `json:"intervalCount"`
	Amount             int                       `json:"amount"`
	Currency           Currency                  `json:"currency"`
	CurrentPeriodStart string                    `json:"currentPeriodStart"`
	CurrentPeriodEnd   string                    `json:"currentPeriodEnd"`
	CancelAtPeriodEnd  bool                      `json:"cancelAtPeriodEnd"`
	CanceledAt         *string                   `json:"canceledAt"`
	CancellationReason *string                   `json:"cancellationReason"`
	CustomerEmail      string                    `json:"customerEmail"`
	CardLast4          string                    `json:"cardLast4"`
	Transactions       []SubscriptionTransaction `json:"transactions,omitempty"`
	CreatedAt          string                    `json:"createdAt"`
	UpdatedAt          *string                   `json:"updatedAt"`
}

// --- Transfers (Pix Out) ---

type PixKeyType string

type TransferStatus string

// cancelableTransferStatuses are the statuses from which a transfer can
// typically be cancelled.
var cancelableTransferStatuses = map[TransferStatus]struct{}{
	"pending": {}, "scheduled": {},
}

// IsTransferCancelable reports whether a transfer in the given status can be
// cancelled.
func IsTransferCancelable(status TransferStatus) bool {
	_, ok := cancelableTransferStatuses[status]
	return ok
}

type CreateTransferInput struct {
	PixKeyType  PixKeyType `json:"pix_key_type"`
	PixKeyValue string     `json:"pix_key_value"`
	Amount      int        `json:"amount"` // cents, min 1000
	Description string     `json:"description,omitempty"`
	ExternalRef string     `json:"external_ref,omitempty"`
}

type Transfer struct {
	ID            string         `json:"id"`
	Amount        string         `json:"amount"` // decimal string of cents on responses
	Fee           int            `json:"fee"`
	Type          string         `json:"type"`
	PixKey        string         `json:"pix_key"`
	PixKeyType    *string        `json:"pix_key_type"`
	Status        TransferStatus `json:"status"`
	Description   *string        `json:"description"`
	ExternalRef   *string        `json:"external_ref"`
	ProcessedAt   *string        `json:"processed_at"`
	TransferredAt *string        `json:"transferred_at"`
	CreatedAt     string         `json:"created_at"`
	UpdatedAt     string         `json:"updated_at"`
}

// --- Checkout links ---

type CheckoutLinkProduct struct {
	ExternalID string `json:"external_id"`
	Name       string `json:"name"`
	Price      int    `json:"price"`
	Quantity   int    `json:"quantity,omitempty"`
	Type       string `json:"type,omitempty"`
}

type CreateCheckoutLinkInput struct {
	Amount   int                   `json:"amount,omitempty"`
	Currency Currency              `json:"currency,omitempty"`
	Title    string                `json:"title,omitempty"`
	Products []CheckoutLinkProduct `json:"products"`
}
