# On-the-wire types for the Pagou API v2, transcribed from the OpenAPI schema.
# The envelope keys are camelCase (`requestId`) while most resource bodies are
# snake_case; a few resources (subscriptions) serialize camelCase. Field casing
# here matches exactly what the API returns.

from typing import Literal

TransactionStatus = Literal[
    "authorized",
    "canceled",
    "captured",
    "chargedback",
    "three_ds_required",
    "expired",
    "in_protest",
    "paid",
    "partially_paid",
    "partially_refunded",
    "pending",
    "processing",
    "processed",
    "refunded",
    "med",
    "refused",
]

# Statuses at which a charge is settled and it is safe to fulfill.
TERMINAL_PAID_STATUSES = frozenset({"paid", "captured"})

PaymentMethod = Literal["pix", "voucher", "credit_card"]

TransferStatus = Literal[
    "pending",
    "scheduled",
    "in_analysis",
    "processing",
    "paid",
    "rejected",
    "cancelled",
    "error",
    "unknown",
]

# Statuses from which a transfer can typically be cancelled.
CANCELABLE_TRANSFER_STATUSES = frozenset({"pending", "scheduled"})

PixKeyType = Literal["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"]

SubscriptionStatus = Literal[
    "incomplete",
    "trialing",
    "active",
    "past_due",
    "cancel_scheduled",
    "canceled",
]
