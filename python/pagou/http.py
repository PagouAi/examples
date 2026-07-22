import json
import math
import time
import uuid
from dataclasses import dataclass
from typing import Any, Generic, Optional, TypeVar
from urllib.parse import urlencode

import httpx

from .config import PagouConfig, load_config
from .errors import NetworkError, to_api_error
from .logger import logger

T = TypeVar("T")

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}
_IDEMPOTENT_METHODS = {"GET", "HEAD"}


@dataclass
class Result(Generic[T]):
    data: T
    status: int
    request_id: Optional[str] = None


@dataclass
class CursorPage(Generic[T]):
    """Cursor envelope for list endpoints.

    ``next_cursor`` / ``prev_cursor`` are snake_case, matching the wire format.
    """

    success: bool
    request_id: str
    data: list
    next_cursor: Optional[str]
    prev_cursor: Optional[str]
    total: int

    @classmethod
    def from_envelope(cls, body: dict) -> "CursorPage":
        return cls(
            success=bool(body.get("success", True)),
            request_id=body.get("requestId", ""),
            data=body.get("data", []) or [],
            next_cursor=body.get("next_cursor"),
            prev_cursor=body.get("prev_cursor"),
            total=int(body.get("total", 0)),
        )


class PagouHttpClient:
    """Minimal, dependency-light reference client for the Pagou API v2.

    It demonstrates the fundamentals every language example must show: server-side
    auth, correlation ids, idempotency keys, timeouts, bounded retries for
    transient failures on idempotent operations, typed errors and redacted logging.
    """

    def __init__(
        self,
        config: Optional[PagouConfig] = None,
        transport: Optional[httpx.BaseTransport] = None,
    ) -> None:
        self.config = config or load_config()
        # A custom transport lets tests inject responses without a network call.
        self._client = httpx.Client(transport=transport)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "PagouHttpClient":
        return self

    def __exit__(self, *_exc: Any) -> None:
        self.close()

    def _auth_header(self) -> tuple[str, str]:
        # The API key is a server-side secret; it is never read in browser code.
        return ("Authorization", f"Bearer {self.config.api_token}")

    def _build_url(self, path: str, query: Optional[dict]) -> str:
        base = self.config.base_url.rstrip("/")
        url = f"{base}/{path.lstrip('/')}"
        if not query:
            return url
        pairs = []
        for key, value in query.items():
            if value is None:
                continue
            if isinstance(value, (list, tuple)):
                if not value:
                    continue
                pairs.append((key, ",".join(str(v) for v in value)))
            else:
                pairs.append((key, str(value)))
        if not pairs:
            return url
        return f"{url}?{urlencode(pairs)}"

    def _can_retry(self, method: str, idempotency_key: Optional[str]) -> bool:
        if method in _IDEMPOTENT_METHODS:
            return True
        # Writes are retried only when an idempotency key guards against duplicates.
        return method in ("POST", "PUT") and bool(idempotency_key)

    def request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[dict] = None,
        body: Any = None,
        idempotency_key: Optional[str] = None,
        request_id: Optional[str] = None,
        timeout_ms: Optional[int] = None,
    ) -> Result:
        request_id = request_id or str(uuid.uuid4())
        url = self._build_url(path, query)
        retryable = self._can_retry(method, idempotency_key)
        max_attempts = (self.config.max_retries + 1) if retryable else 1
        timeout_s = (timeout_ms if timeout_ms is not None else self.config.timeout_ms) / 1000

        logger.info(f"→ {method} {path}", {"requestId": request_id, "body": body})

        last_error: Optional[BaseException] = None
        for attempt in range(max_attempts):
            headers = {"Accept": "application/json", "X-Request-Id": request_id}
            headers[self._auth_header()[0]] = self._auth_header()[1]
            if idempotency_key:
                headers["Idempotency-Key"] = idempotency_key
            content = None
            if body is not None:
                headers["Content-Type"] = "application/json"
                content = json.dumps(body)

            try:
                response = self._client.request(
                    method, url, headers=headers, content=content, timeout=timeout_s
                )
            except httpx.TimeoutException as error:
                last_error = error
                if retryable and attempt < max_attempts - 1:
                    time.sleep(_backoff_seconds(attempt, None))
                    continue
                raise NetworkError("Request timed out", request_id=request_id, cause=error)
            except httpx.HTTPError as error:
                last_error = error
                if retryable and attempt < max_attempts - 1:
                    time.sleep(_backoff_seconds(attempt, None))
                    continue
                raise NetworkError("Network request failed", request_id=request_id, cause=error)

            response_id = response.headers.get("x-request-id") or request_id
            payload = _parse_body(response)

            if response.status_code >= 400:
                if (
                    retryable
                    and response.status_code in _RETRYABLE_STATUS
                    and attempt < max_attempts - 1
                ):
                    time.sleep(_backoff_seconds(attempt, response.headers.get("Retry-After")))
                    continue
                error = to_api_error(response.status_code, payload, response_id)
                logger.warn(
                    f"← {response.status_code} {method} {path}",
                    {"requestId": response_id, "code": error.code},
                )
                raise error

            logger.info(f"← {response.status_code} {method} {path}", {"requestId": response_id})
            return Result(data=payload, status=response.status_code, request_id=response_id)

        raise NetworkError("Request failed after retries", request_id=request_id, cause=last_error)

    def request_data(self, method: str, path: str, **kwargs: Any) -> Result:
        """Unwraps a ``{ success, requestId, data }`` envelope to its ``data``."""
        result = self.request(method, path, **kwargs)
        envelope = result.data if isinstance(result.data, dict) else {}
        return Result(
            data=envelope.get("data"),
            status=result.status,
            request_id=envelope.get("requestId") or result.request_id,
        )

    def request_cursor_page(self, method: str, path: str, **kwargs: Any) -> Result:
        """Returns a full cursor page (keeps ``next_cursor`` / ``prev_cursor`` / ``total``)."""
        result = self.request(method, path, **kwargs)
        body = result.data if isinstance(result.data, dict) else {}
        return Result(
            data=CursorPage.from_envelope(body),
            status=result.status,
            request_id=result.request_id,
        )


def _parse_body(response: httpx.Response) -> Any:
    content_type = response.headers.get("content-type", "")
    text = response.text
    if not text:
        return None
    if "json" in content_type:
        try:
            return json.loads(text)
        except ValueError:
            return text
    return text


def _backoff_seconds(attempt: int, retry_after: Optional[str]) -> float:
    if retry_after:
        try:
            seconds = float(retry_after)
            return min(seconds, 5.0)
        except ValueError:
            pass
    base = 200 * (2**attempt)
    jitter = math.floor(_deterministic_jitter(attempt) * 200)
    return min(base + jitter, 5000) / 1000


def _deterministic_jitter(attempt: int) -> float:
    # Small deterministic jitter keeps the reference reproducible without random.
    x = math.sin(attempt + 1) * 10_000
    return x - math.floor(x)
