import time

from demo_data import demo_buyer, demo_products

from pagou.format import format_amount, print_result
from pagou.http import PagouHttpClient


# Creates a voucher (boleto) charge. The printable instructions arrive
# asynchronously: the create response may return `status: pending` with the
# `voucher` block populated once the instrument is issued. Reconcile with a
# GET or a webhook to obtain the final barcode / digitable line / PDF URL.
# Run: python payments/create_voucher.py
def main() -> None:
    client = PagouHttpClient()

    payload = {
        "amount": 4900,
        "method": "voucher",
        "currency": "BRL",
        "buyer": demo_buyer,
        "products": demo_products,
        "external_ref": f"voucher_{int(time.time() * 1000)}",
    }

    tx = client.request_data("POST", "/v2/transactions", body=payload).data
    print(f"Created {tx['id']} — {tx['status']} — {format_amount(tx['amount'], tx['currency'])}")

    voucher = tx.get("voucher") or {}
    if voucher.get("barcode") or voucher.get("url"):
        print_result("Voucher instructions", voucher)
    else:
        print(f"Instructions not ready yet — reconcile {tx['id']} via GET or wait for the webhook.")


if __name__ == "__main__":
    main()
