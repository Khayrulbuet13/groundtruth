from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ENV = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(REPO_ENV), extra="ignore")

    database_url: str = "postgresql+asyncpg://quiz:quiz@postgres:5432/quiz"
    secret_key: str = "change-me-in-production"
    base_url: str = "http://localhost:8080"
    github_client_id: str = ""
    github_client_secret: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    session_ttl_days: int = 30
    dev_auth: bool = False
    cookie_secure: bool = True
    raw_upload_dir: str = "/data/raw"
    max_raw_bytes: int = 1_048_576
    max_raw_per_user_per_day: int = 10


settings = Settings()
