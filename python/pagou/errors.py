from typing import Any, Optional


class ApiError(Exception):
    """Base class for every error surfaced by the raw HTTP reference client."""

    def __init__(
        self,
        message: str,
        *,
        status: Optional[int] = None,
        code: Optional[str] = None,
        request_id: Optional[str] = None,
        details: Any = None,
        raw: Any = None,
        cause: Optional[BaseException] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.request_id = request_id
        self.details = details
        self.raw = raw
        if cause is not None:
            self.__cause__ = cause


class AuthenticationError(ApiError):
    """401."""


class PermissionError(ApiError):  # noqa: A001 - mirrors the reference error taxonomy
    """403."""


class InvalidRequestError(ApiError):
    """400/422 and other 4xx."""


class NotFoundError(ApiError):
    """404."""


class ConflictError(ApiError):
    """409 (e.g. duplicate external_ref)."""


class RateLimitError(ApiError):
    """429."""


class ServerError(ApiError):
    """5xx."""


class NetworkError(ApiError):
    """Transport failure / timeout."""


def _parse_error_body(body: Any, fallback_request_id: Optional[str]) -> dict:
    """Normalizes the two documented error shapes: the simple
    ``{ error, message, status }`` body and RFC 7807 ``application/problem+json``
    (``{ title, detail, errors[] }``).
    """
    if not isinstance(body, dict):
        return {"message": "Request failed", "request_id": fallback_request_id}

    message = (
        (isinstance(body.get("message"), str) and body["message"])
        or (isinstance(body.get("detail"), str) and body["detail"])
        or (isinstance(body.get("title"), str) and body["title"])
        or (isinstance(body.get("error"), str) and body["error"])
        or "Request failed"
    )
    if isinstance(body.get("code"), str):
        code = body["code"]
    elif isinstance(body.get("error"), str):
        code = body["error"]
    else:
        code = None
    if isinstance(body.get("requestId"), str):
        request_id = body["requestId"]
    elif isinstance(body.get("request_id"), str):
        request_id = body["request_id"]
    else:
        request_id = fallback_request_id
    details = body.get("errors") if body.get("errors") is not None else body.get("details")
    return {"message": message, "code": code, "request_id": request_id, "details": details}


_STATUS_TO_ERROR = {
    401: AuthenticationError,
    403: PermissionError,
    404: NotFoundError,
    409: ConflictError,
    429: RateLimitError,
}


def to_api_error(status: int, body: Any, request_id_from_header: Optional[str] = None) -> ApiError:
    """Maps an HTTP status + response body to the matching typed error."""
    parsed = _parse_error_body(body, request_id_from_header)
    if status in _STATUS_TO_ERROR:
        cls = _STATUS_TO_ERROR[status]
    elif status >= 500:
        cls = ServerError
    else:
        cls = InvalidRequestError
    return cls(
        parsed["message"],
        status=status,
        code=parsed.get("code"),
        request_id=parsed.get("request_id"),
        details=parsed.get("details"),
        raw=body,
    )
