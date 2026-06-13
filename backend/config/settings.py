"""
EcoLoop AI - Application Settings

Centralized configuration using Pydantic Settings.
All values are loaded from environment variables or a .env file.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # AWS Configuration
    aws_region: str = "us-east-1"
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None

    # S3 Configuration
    s3_bucket_name: str = "ecoloop-ai-ananya-images"

    # DynamoDB Configuration
    dynamodb_assessments_table: str = "Assessments"
    dynamodb_usermetrics_table: str = "UserMetrics"
    dynamodb_listings_table: str = "Listings"

    # Bedrock Configuration
    bedrock_model_id: str = "us.amazon.nova-pro-v1:0"
    bedrock_text_model_id: str = "us.amazon.nova-pro-v1:0"

    # Application Configuration
    app_env: str = "development"
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    """
    Return cached application settings.

    Uses lru_cache to avoid re-reading .env on every call.
    """
    return Settings()
