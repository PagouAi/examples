from pagou.format import print_result
from pagou.http import PagouHttpClient


# Creates a hosted checkout link. The v2 contract exposes only POST — the
# returned public identifier is the checkout URL itself (`data.url`); persist
# it to share with the buyer. There is no retrieve/list endpoint.
# Run: python checkout-links/create.py
def main() -> None:
    client = PagouHttpClient()

    payload = {
        "title": "Pro Plan",
        "currency": "BRL",
        "products": [
            {"external_id": "pro-plan", "name": "Pro Plan", "price": 4900, "quantity": 1, "type": "digital"}
        ],
    }

    data = client.request_data("POST", "/v2/checkout-links", body=payload).data

    # Persist the URL — it is the only handle to the link.
    print_result("Checkout link (store this URL)", data["url"])


if __name__ == "__main__":
    main()
