import json
import re
import sys
from typing import Any, Optional

SENSITIVE_KEYS = {
    "authorization",
    "apikey",
    "api_key",
    "token",
    "access_token",
    "client_secret",
    "secret",
    "password",
    "cvv",
    "cvc",
    "pan",
    "card_number",
    "number",
}

_TOKEN_PATTERNS = [
    re.compile(r"\bBearer\s+[A-Za-z0-9._-]+", re.IGNORECASE),
    re.compile(r"\bpg(ct|pm|sk|pk)_[A-Za-z0-9]+"),
]

_REDACTED = "[REDACTED]"


def _redact_string(value: str) -> str:
    out = value
    for pattern in _TOKEN_PATTERNS:
        out = pattern.sub(_REDACTED, out)
    return out


def redact(value: Any, _seen: Optional[set] = None) -> Any:
    """Deep-copies a value with sensitive fields masked.

    Used before anything is logged so secrets, tokens and card data never reach
    stdout or a log sink.
    """
    if isinstance(value, str):
        return _redact_string(value)
    if value is None or not isinstance(value, (dict, list)):
        return value

    if _seen is None:
        _seen = set()
    if id(value) in _seen:
        return "[Circular]"
    _seen.add(id(value))

    if isinstance(value, list):
        return [redact(item, _seen) for item in value]

    out: dict = {}
    for key, item in value.items():
        out[key] = _REDACTED if str(key).lower() in SENSITIVE_KEYS else redact(item, _seen)
    return out


def _emit(stream, message: str, context: Optional[dict]) -> None:
    line = f"{message} {json.dumps(redact(context))}" if context else message
    print(line, file=stream)


class Logger:
    def info(self, message: str, context: Optional[dict] = None) -> None:
        _emit(sys.stdout, message, context)

    def warn(self, message: str, context: Optional[dict] = None) -> None:
        _emit(sys.stderr, message, context)

    def error(self, message: str, context: Optional[dict] = None) -> None:
        _emit(sys.stderr, message, context)


logger = Logger()
