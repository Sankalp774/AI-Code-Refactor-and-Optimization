from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal


Mode = Literal["local", "cloud"]


@dataclass(frozen=True, slots=True)
class Settings:
    cors_allow_origins: list[str]
    default_mode: Mode
    cloud_model: str
    local_model: str
    ollama_base_url: str


def get_settings() -> Settings:
    origins = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:5173")
    cors_allow_origins = [o.strip() for o in origins.split(",") if o.strip()]
    mode_raw = os.getenv("REFACTORAI_MODE", "local").strip().lower()
    default_mode: Mode = "cloud" if mode_raw == "cloud" else "local"
    return Settings(
        cors_allow_origins=cors_allow_origins,
        default_mode=default_mode,
        cloud_model=os.getenv("CLOUD_MODEL", "groq/llama-3.1-8b-instant"),
        local_model=os.getenv("LOCAL_MODEL", "ollama/qwen2.5-coder:7b"),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    )

