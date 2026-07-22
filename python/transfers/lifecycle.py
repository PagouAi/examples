import time

from pagou.errors import ConflictError
from pagou.format import idempotency_key, print_result
from pagou.http import PagouHttpClient
from pagou.types import CANCELABLE_TRANSFER_STATUSES


# Pix Out lifecycle with the raw client: create → retrieve/reconcile → cancel.
# The final state (paid / rejected) arrives via the transfer webhook family;
# reconcile with GET when you need certainty. Note `amount` is a numeric cents
# value on input but a decimal string on responses.
# Run: python transfers/lifecycle.py
def main() -> None:
    client = PagouHttpClient()

    external_ref = f"payout_{int(time.time() * 1000)}"
    payload = {
        "pix_key_type": "EMAIL",
        "pix_key_value": "supplier@example.com",
        "amount": 5000,  # R$50.00 in cents (minimum is 1000)
        "description": "Supplier payout",
        "external_ref": external_ref,
    }

    created = client.request_data(
        "POST", "/v2/transfers", body=payload, idempotency_key=idempotency_key("transfer", external_ref)
    ).data
    print(f"Transfer {created['id']} — {created['status']} — amount(cents)={created['amount']}")

    # Reconcile: re-read the current state before acting on it.
    current = client.request_data("GET", f"/v2/transfers/{created['id']}").data
    print_result("Current state", {"id": current["id"], "status": current["status"], "fee": current.get("fee")})

    if current["status"] not in CANCELABLE_TRANSFER_STATUSES:
        print(f"Status {current['status']} is not cancelable; the final state will arrive by webhook.")
        return

    try:
        canceled = client.request_data(
            "POST", f"/v2/transfers/{created['id']}/cancel", body={"reason": "wrong recipient"}
        ).data
        print(f"Canceled {canceled['id']} — {canceled['status']}")
    except ConflictError:
        print("Already progressed past a cancelable state — reconcile via webhook/GET.")


if __name__ == "__main__":
    main()
