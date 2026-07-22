from demo_data import resource_id_from_args

from pagou.reconcile import reconcile_transaction


# Reconciles a transaction against the API and prints the fulfillment decision.
# This is the safe pattern behind every webhook: trust the API, not the event.
# Run: python payments/reconcile.py <transaction_id>
def main() -> None:
    transaction_id = resource_id_from_args("PAGOU_TRANSACTION_ID")
    result = reconcile_transaction(transaction_id)

    if not result:
        print(f"No transaction {transaction_id}.")
        return

    transaction = result["transaction"]
    decision = result["decision"]
    print(f"Transaction {transaction['id']} is {transaction['status']} → decision: {decision}")
    if decision == "fulfill":
        print("Safe to deliver: the charge is settled.")
    elif decision == "wait":
        print("Not settled yet: keep the order pending and reconcile again later.")
    else:
        print("Failed/expired: release the order.")


if __name__ == "__main__":
    main()
