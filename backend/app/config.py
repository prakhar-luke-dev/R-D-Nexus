from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="RDN_", extra="ignore")

    # SQLite by default for zero-setup local development.
    # Use e.g. postgresql+psycopg://rdnexus:rdnexus@localhost:5432/rdnexus for Postgres.
    database_url: str = f"sqlite:///{BASE_DIR / 'rdnexus.db'}"
    upload_dir: Path = BASE_DIR / "uploads"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Overall progress weighting. These are 50/50 by default, kept configurable for later.
    code_weight: float = 0.5
    validation_weight: float = 0.5


settings = Settings()
