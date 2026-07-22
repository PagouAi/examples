import os
import sys

# Synthetic buyer data — safe to commit. Never use real documents or PII.
demo_buyer = {
    "name": "Ana Souza",
    "email": "ana.souza@example.com",
    "document": {"type": "CPF", "number": "19100000000"},
}

demo_products = [{"name": "Pro Plan", "price": 4900, "quantity": 1}]


def resource_id_from_args(env_var: str) -> str:
    """Reads a resource id from the first CLI argument or an env var."""
    resource_id = sys.argv[1] if len(sys.argv) > 1 else os.environ.get(env_var)
    if not resource_id:
        raise RuntimeError(f"Pass a resource id as the first argument or set {env_var}.")
    return resource_id
