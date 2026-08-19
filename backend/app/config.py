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
    # Prefer minutes; if only DB_RESET_INTERVAL_HOURS is set in .env, main.py maps it.
    db_reset_interval_minutes: float = 60
    db_reset_interval_hours: Optional[float] = None
    geoip_db_path: str = "data/GeoLite2-City.mmdb"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def effective_db_reset_minutes(self) -> float:
        """Hours env wins when set (droplet .env uses DB_RESET_INTERVAL_HOURS)."""
        if self.db_reset_interval_hours is not None and self.db_reset_interval_hours > 0:
            return float(self.db_reset_interval_hours) * 60.0
        return float(self.db_reset_interval_minutes or 0)


@lru_cache()
def get_settings() -> Settings:
    return Settings()
