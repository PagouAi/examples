import os
import time

from pagou.http import PagouHttpClient


# Customers are not exposed as a distinct SDK resource in any language, so the
# subscription example creates or reuses a customer through the raw client.
def create_or_reuse_customer(client: PagouHttpClient) -> dict:
    """Reuses PAGOU_CUSTOMER_ID when set, otherwise creates a fresh customer."""
    existing = os.environ.get("PAGOU_CUSTOMER_ID")
    if existing:
        return client.request_data("GET", f"/v2/customers/{existing}").data

    suffix = int(time.time() * 1000)
    payload = {
        "name": "Ana Souza",
        "email": f"ana.souza+{suffix}@example.com",
        "document": {"type": "CPF", "number": "19100000000"},
        "phone": "11999990000",
        "externalRef": f"cust_{suffix}",
    }
    return client.request_data("POST", "/v2/customers", body=payload).data
