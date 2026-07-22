"""Shared reference client and utilities for the Pagou API v2 examples.

The public surface mirrors the TypeScript reference in ``typescript/src/lib``:
config loading, a dependency-light HTTP client, typed errors, redacted logging,
reconciliation helpers and on-the-wire types.
"""

from .config import PagouConfig, load_config
from .errors import (
    ApiError,
    AuthenticationError,
    ConflictError,
    InvalidRequestError,
    NetworkError,
    NotFoundError,
    PermissionError,
    RateLimitError,
    ServerError,
    to_api_error,
)
from .http import CursorPage, PagouHttpClient, Result
from .logger import logger, redact
from .reconcile import decide_fulfillment, reconcile_transaction

__all__ = [
    "PagouConfig",
    "load_config",
    "ApiError",
    "AuthenticationError",
    "ConflictError",
    "InvalidRequestError",
    "NetworkError",
    "NotFoundError",
    "PermissionError",
    "RateLimitError",
    "ServerError",
    "to_api_error",
    "CursorPage",
    "PagouHttpClient",
    "Result",
    "logger",
    "redact",
    "decide_fulfillment",
    "reconcile_transaction",
]
