import sys

from demo_data import resource_id_from_args

from pagou.format import print_result
from pagou.http import PagouHttpClient


# Sandbox-only helper: forces a transaction to a target status so you can
# exercise the paid/refunded paths without a real payer. Never available in
# production. Run: python payments/create_pix.py, then:
# python payments/sandbox_advance.py <transaction_id> [status=paid]
def main() -> None:
    transaction_id = resource_id_from_args("PAGOU_TRANSACTION_ID")
    status = sys.argv[2] if len(sys.argv) > 2 else "paid"
    client = PagouHttpClient()

    data = client.request_data(
        "PUT", f"/v2/transactions/{transaction_id}", body={"status": status}
    ).data

    print_result("Sandbox transaction updated", data["transaction"])


if __name__ == "__main__":
    main()
