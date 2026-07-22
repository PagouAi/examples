import json
from decimal import Decimal
from typing import Any

_CURRENCY_SYMBOLS = {"BRL": "R$", "USD": "$", "MXN": "$", "ARS": "$", "COP": "$", "CLP": "$"}


def format_amount(cents: int, currency: str = "BRL") -> str:
    """Formats an integer amount in the smallest currency unit as a display string."""
    symbol = _CURRENCY_SYMBOLS.get(currency, f"{currency} ")
    value = (Decimal(cents) / Decimal(100)).quantize(Decimal("0.01"))
    return f"{symbol}{value:,.2f}"


def idempotency_key(operation: str, reference: str) -> str:
    """A short, unique idempotency key for a given operation and reference."""
    return f"{operation}_{reference}"


def print_result(label: str, value: Any) -> None:
    """Prints a labelled JSON block for readable script output."""
    print(f"\n{label}:")
    print(json.dumps(value, indent=2, default=str))
