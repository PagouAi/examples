import os
from dataclasses import dataclass
from typing import Literal, Optional

from dotenv import load_dotenv

load_dotenv()

Environment = Literal["sandbox", "production"]

SANDBOX_BASE_URL = "https://api.sandbox.pagou.ai"
PRODUCTION_BASE_URL = "https://api.pagou.ai"


@dataclass(frozen=True)
class PagouConfig:
    environment: Environment
    base_url: str
    api_token: str
    webhook_url: Optional[str] = None
    publishable_key: Optional[str] = None
    timeout_ms: int = 30_000
    max_retries: int = 2


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value or value.strip() == "":
        raise RuntimeError(
            f"Missing required environment variable {name}. Copy .env.example to .env and set it."
        )
    return value


def _resolve_environment() -> Environment:
    raw = (os.environ.get("PAGOU_ENVIRONMENT") or "sandbox").lower()
    if raw not in ("sandbox", "production"):
        raise RuntimeError(f'PAGOU_ENVIRONMENT must be "sandbox" or "production", got "{raw}".')
    return raw  # type: ignore[return-value]


def _resolve_base_url(environment: Environment) -> str:
    override = (os.environ.get("PAGOU_BASE_URL") or "").strip()
    if override:
        return override.rstrip("/")
    return PRODUCTION_BASE_URL if environment == "production" else SANDBOX_BASE_URL


def load_config() -> PagouConfig:
    """Loads and validates configuration from the environment.

    The API token is a server-side secret and is never exposed to the browser.
    """
    environment = _resolve_environment()
    return PagouConfig(
        environment=environment,
        base_url=_resolve_base_url(environment),
        api_token=_require_env("PAGOU_API_TOKEN"),
        webhook_url=os.environ.get("PAGOU_WEBHOOK_URL"),
        publishable_key=os.environ.get("PAGOU_PUBLISHABLE_KEY"),
        timeout_ms=int(os.environ.get("PAGOU_TIMEOUT_MS", "30000")),
        max_retries=int(os.environ.get("PAGOU_MAX_RETRIES", "2")),
    )
