"""
Configuration settings for UAV2LoD1-ZW Backend.
Uses pydantic-settings for environment variable management.
"""

from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )
    
    # Application
    APP_NAME: str = "UAV2LoD1-ZW Backend"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Data paths
    DATA_ROOT: Path = Path("/data/uav2lod1")
    PROJECTS_DIR: str = "projects"
    UPLOADS_DIR: str = "uploads"
    AVATARS_DIR: str = "avatars"
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./uav2lod1.db"
    
    # Security
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]
    
    # Pipeline defaults
    DEFAULT_CRS: str = "EPSG:32736"  # UTM Zone 36S for Zimbabwe
    DEFAULT_GSD: float = 0.05  # 5cm
    DEFAULT_ENGINE: str = "odm"
    
    # Thumbnail settings
    THUMBNAIL_SIZE: tuple[int, int] = (256, 256)
    THUMBNAIL_QUALITY: int = 85
    
    @property
    def projects_path(self) -> Path:
        """Full path to projects directory."""
        path = self.DATA_ROOT / self.PROJECTS_DIR
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    @property
    def uploads_path(self) -> Path:
        """Full path to uploads directory."""
        path = self.DATA_ROOT / self.UPLOADS_DIR
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    @property
    def avatars_path(self) -> Path:
        """Full path to avatars directory."""
        path = self.DATA_ROOT / self.AVATARS_DIR
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
