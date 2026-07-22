from demo_data import resource_id_from_args

from pagou.errors import NotFoundError
from pagou.format import print_result
from pagou.http import PagouHttpClient


# Retrieves a transaction by its public UUID.
# Run: python payments/retrieve.py <transaction_id>
def main() -> None:
    transaction_id = resource_id_from_args("PAGOU_TRANSACTION_ID")
    client = PagouHttpClient()

    try:
        tx = client.request_data("GET", f"/v2/transactions/{transaction_id}").data
    except NotFoundError:
        print(f"No transaction {transaction_id}.")
        return

    print_result(
        "Transaction",
        {
            "id": tx["id"],
            "status": tx["status"],
            "amount": tx["amount"],
            "paid_amount": tx.get("paid_amount"),
            "refunded_amount": tx.get("refunded_amount"),
            "paid_at": tx.get("paid_at"),
        },
    )


if __name__ == "__main__":
    main()
