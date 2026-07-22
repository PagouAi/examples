import time

from demo_data import demo_buyer, demo_products

from pagou.errors import ConflictError
from pagou.format import format_amount, print_result
from pagou.http import PagouHttpClient


# Creates a Pix charge and returns the copy-and-paste QR payload (`pix.qr_code`).
# Run: python payments/create_pix.py
def main() -> None:
    client = PagouHttpClient()

    payload = {
        "amount": 4900,
        "method": "pix",
        "currency": "BRL",
        "buyer": demo_buyer,
        "products": demo_products,
        # `external_ref` doubles as a natural idempotency key: a duplicate value
        # is rejected with 409 DUPLICATE_EXTERNAL_REF instead of double-charging.
        "external_ref": f"order_{int(time.time() * 1000)}",
    }

    try:
        tx = client.request_data("POST", "/v2/transactions", body=payload).data
    except ConflictError:
        print("Duplicate external_ref — this charge was already created.")
        return

    print(f"Created {tx['id']} — {tx['status']} — {format_amount(tx['amount'], tx['currency'])}")
    pix = tx.get("pix") or {}
    print_result("Pix QR (copy and paste)", pix.get("qr_code"))
    print_result("Expires at", pix.get("expiration_date"))


if __name__ == "__main__":
    main()
