from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Math Essay Grader"
    database_url: str = "sqlite:///./data/app.db"
    upload_dir: str = "./data/uploads"
    processed_dir: str = "./data/processed"
    export_dir: str = "./data/exports"
    mathpix_app_id: str = ""
    mathpix_app_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_model: str = "gpt-4o"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    ocr_confidence_threshold: float = 0.75
    ocr_concurrency: int = 2
    grading_concurrency: int = 4
    region_margin_x_ratio: float = 0.08
    region_margin_top_ratio: float = 0.05
    region_margin_bottom_ratio: float = 0.12

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    def ensure_dirs(self) -> None:
        for directory in [self.upload_dir, self.processed_dir, self.export_dir, "./data"]:
            Path(directory).mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_dirs()
    return settings
