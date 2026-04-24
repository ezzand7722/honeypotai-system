from pathlib import Path
from functools import lru_cache
from typing import Optional, Sequence

from pydantic import HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    honeypot_shared_secret: str = "default-shared-secret"
    ai_service_url: HttpUrl = "http://localhost:9000/ai/score"
    ai_api_key: str = "default-ai-api-key"
    cors_origins: Sequence[str] = ("*",)
    ai_request_timeout_seconds: int = 10
    ai_chunk_size: int = 25
    ai_chunk_pause_ms: int = 0
    database_url: Optional[str] = None
    database_path: str = "data/honeypot_events.db"

    model_config = SettingsConfigDict(
        env_file=(
            str(Path(__file__).resolve().parents[1] / ".env"),
            ".env",
        )
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
