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
    # Wipe live tables only after this many minutes with NO log/event ingest.
    # 0 = disable idle reset. Env: DB_IDLE_RESET_MINUTES=2.5
    db_idle_reset_minutes: float = 2.5
    # Legacy fixed-interval knobs (ignored when idle reset is active)
    db_reset_interval_minutes: float = 0
    db_reset_interval_hours: Optional[float] = None
    geoip_db_path: str = "data/GeoLite2-City.mmdb"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def effective_idle_reset_seconds(self) -> float:
        """Seconds of no ingest before live DB wipe. 0 = off."""
        mins = float(self.db_idle_reset_minutes or 0)
        return max(0.0, mins * 60.0)


@lru_cache()
def get_settings() -> Settings:
    return Settings()
