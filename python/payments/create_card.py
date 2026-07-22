import os
import sys
import time

from demo_data import demo_buyer, demo_products

from pagou.format import format_amount, print_result
from pagou.http import PagouHttpClient


# Backend half of the card flow. The `pgct_*` token is produced in the browser
# by the Payment Element (see ./card_element) and posted to your server; it is
# the ONLY card credential your backend ever sees — never a PAN or CVV.
# Run: PAGOU_CARD_TOKEN=pgct_... python payments/create_card.py  (or pass as arg 1)
def main() -> None:
    token = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PAGOU_CARD_TOKEN")
    if not token:
        raise RuntimeError(
            "Provide a pgct_ token from the Payment Element (arg 1 or PAGOU_CARD_TOKEN). "
            "Start the browser demo with: python payments/card_element/server.py"
        )

    client = PagouHttpClient()
    payload = {
        "amount": 4900,
        "method": "credit_card",
        "currency": "BRL",
        "token": token,
        "installments": 1,
        "buyer": demo_buyer,
        "products": demo_products,
        "external_ref": f"card_{int(time.time() * 1000)}",
    }

    tx = client.request_data("POST", "/v2/transactions", body=payload).data
    print(f"Created {tx['id']} — {tx['status']} — {format_amount(tx['amount'], tx['currency'])}")

    if tx["status"] == "three_ds_required" and tx.get("next_action"):
        # 3DS: return `next_action` to the browser so the Payment Element can open
        # the challenge. Do NOT fulfill here — wait for the confirmed webhook.
        print_result("next_action (return to the browser to continue 3DS)", tx["next_action"])
        return

    print("No 3DS challenge required. Confirm the final state via webhook or reconciliation.")


if __name__ == "__main__":
    main()
