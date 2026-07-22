import sys

from demo_data import resource_id_from_args

from pagou.errors import InvalidRequestError
from pagou.format import format_amount, idempotency_key, print_result
from pagou.http import PagouHttpClient


# Refunds a transaction. Omit the amount for a full refund; pass cents for a
# partial one. The refund is idempotent via an Idempotency-Key so a retry after
# a network blip never double-refunds.
# Run: python payments/refund.py <transaction_id> [amount_cents]
def main() -> None:
    transaction_id = resource_id_from_args("PAGOU_TRANSACTION_ID")
    amount = int(sys.argv[2]) if len(sys.argv) > 2 else None
    client = PagouHttpClient()

    body = {"reason": "requested_by_customer"}
    if amount is not None:
        body["amount"] = amount

    try:
        refund = client.request_data(
            "PUT",
            f"/v2/transactions/{transaction_id}/refund",
            body=body,
            idempotency_key=idempotency_key("refund", f"{transaction_id}_{amount if amount is not None else 'full'}"),
        ).data
    except InvalidRequestError as error:
        print(f"Refund rejected: {error.message}")
        return

    print("Full refund processed." if refund["is_full_refund"] else "Partial refund processed.")
    print_result(
        "Refund",
        {
            "amount_refunded": format_amount(refund["amount_refunded"]),
            "remaining_balance": format_amount(refund["remaining_balance"]),
        },
    )


if __name__ == "__main__":
    main()
