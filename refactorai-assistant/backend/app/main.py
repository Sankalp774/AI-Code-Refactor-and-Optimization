from __future__ import annotations

import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.api_routes import router as api_router
from app.config import get_settings
from app.logging_config import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

load_dotenv()
settings = get_settings()

app = FastAPI(title="RefactorAI", version="0.1.0")
app.state.refactorai_mode = settings.default_mode

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


def _serve_frontend_dist(application: FastAPI) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    dist_dir = repo_root / "frontend" / "dist"
    if not dist_dir.exists():
        logger.info("frontend dist not found at %s; API-only mode", dist_dir)
        return

    index_path = dist_dir / "index.html"

    @application.get("/", include_in_schema=False)
    async def spa_index() -> FileResponse:
        return FileResponse(index_path)

    @application.get("/{full_path:path}", include_in_schema=False)
    async def spa_files_or_fallback(full_path: str) -> FileResponse:
        candidate = (dist_dir / full_path).resolve()
        # Prevent path traversal.
        if dist_dir not in candidate.parents and candidate != dist_dir:
            return FileResponse(index_path)
        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index_path)


_serve_frontend_dist(app)

