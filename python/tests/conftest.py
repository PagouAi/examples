import json
from typing import Callable

import httpx
import pytest

from pagou.config import PagouConfig


@pytest.fixture
def config() -> PagouConfig:
    return PagouConfig(
        environment="sandbox",
        base_url="https://api.sandbox.pagou.ai",
        api_token="test_token",
        timeout_ms=1000,
        max_retries=1,
    )


def json_response(status: int, body, headers: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status,
        content=json.dumps(body),
        headers={"content-type": "application/json", **(headers or {})},
    )


class RecordingTransport(httpx.BaseTransport):
    """A mock transport that returns a queued sequence of responses/exceptions
    and records every request it handled (mirrors the injected ``fetch`` in the
    TypeScript reference)."""

    def __init__(self, actions):
        self._actions = list(actions)
        self._last = actions[-1] if actions else None
        self.requests: list[httpx.Request] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        action = self._actions.pop(0) if self._actions else self._last
        if isinstance(action, Exception):
            raise action
        if isinstance(action, Callable):  # type: ignore[arg-type]
            return action(request)
        return action

    @property
    def call_count(self) -> int:
        return len(self.requests)


@pytest.fixture
def make_transport():
    def _make(*actions) -> RecordingTransport:
        return RecordingTransport(actions)

    return _make
