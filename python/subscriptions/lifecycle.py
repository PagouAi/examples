import os

from customers import create_or_reuse_customer

from pagou.format import format_amount, idempotency_key, print_result
from pagou.http import PagouHttpClient


# End-to-end subscription lifecycle with the raw client:
#   create/reuse customer → create subscription → retrieve → cancel.
# Renewal / failure / past-due / cancellation are delivered as webhooks
# (see ../webhooks); business state changes only on those confirmed events.
# Run: PAGOU_CARD_TOKEN=pgct_... python subscriptions/lifecycle.py
def main() -> None:
    token = os.environ.get("PAGOU_CARD_TOKEN")
    if not token:
        raise RuntimeError(
            "Set PAGOU_CARD_TOKEN to a pgct_ token from the Payment Element (subscription mode)."
        )

    client = PagouHttpClient()

    customer = create_or_reuse_customer(client)
    print(f"Customer {customer['id']} ({customer['email']})")

    payload = {
        "customer_id": customer["id"],
        "payment_method": "credit_card",
        "token": token,
        "interval": "month",
        "interval_count": 1,
        "amount": 4900,
        "currency": "BRL",
        "failure_policy": "retry_then_cancel",
        "retry_offsets_days": [1, 3, 7],
        "products": [{"name": "Pro Plan", "price": 4900}],
    }

    # Idempotent create: a retry reuses the same subscription instead of a duplicate.
    sub = client.request_data(
        "POST",
        "/v2/subscriptions",
        body=payload,
        idempotency_key=idempotency_key("sub_create", customer["id"]),
    ).data
    print(f"Subscription {sub['id']} — {sub['status']} — {format_amount(sub['amount'], sub['currency'])}/month")

    fetched = client.request_data("GET", f"/v2/subscriptions/{sub['id']}").data
    print_result("Billed transactions", fetched.get("transactions") or [])

    canceled = client.request_data(
        "POST", f"/v2/subscriptions/{sub['id']}/cancel", body={"reason": "user_requested"}
    ).data
    print(
        f"Canceled {canceled['id']}: cancelAtPeriodEnd={canceled.get('cancelAtPeriodEnd')}, "
        f"canceledAt={canceled.get('canceledAt')}"
    )


if __name__ == "__main__":
    main()
