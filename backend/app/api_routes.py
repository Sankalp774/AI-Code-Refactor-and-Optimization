from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from app.ast_blocks import extract_python_blocks
from app.config import Mode, get_settings
from app.llm_client import LlmNotConfiguredError, llm_structured
from app.models import AnalysisResponse, CodeBlock, RefactoredResponse, SecurityIssue
from app.static_scans import RuffIssue, run_bandit, run_ruff_check

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

MAX_UPLOAD_BYTES = 2 * 1024 * 1024


class ConfigResponse(BaseModel):
    mode: Mode
    model: str


class ConfigUpdateRequest(BaseModel):
    mode: Mode


def _validate_upload(upload: UploadFile) -> None:
    name = upload.filename or "uploaded.py"
    if not name.lower().endswith(".py"):
        raise HTTPException(status_code=400, detail="Only .py files are supported.")


def _ruff_suggestions(issues: list[RuffIssue], limit: int = 20) -> list[str]:
    out: list[str] = []
    for i in issues[:limit]:
        code = i.code or "RUFF"
        out.append(f"{code} at L{i.line}:{i.column} — {i.message}")
    if len(issues) > limit:
        out.append(f"...and {len(issues) - limit} more ruff findings")
    return out


def _dedupe_security(issues: list[SecurityIssue]) -> list[SecurityIssue]:
    seen: set[tuple[str, str, str]] = set()
    out: list[SecurityIssue] = []
    for s in issues:
        key = (s.severity, s.description.strip(), s.location.strip())
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def _get_app_mode(request: Request, settings_mode: Mode) -> Mode:
    mode = getattr(request.app.state, "refactorai_mode", None)
    if mode in {"local", "cloud"}:
        return mode
    return settings_mode


@router.get("/config", response_model=ConfigResponse)
async def get_config(request: Request) -> ConfigResponse:
    settings = get_settings()
    mode = _get_app_mode(request, settings.default_mode)
    model = settings.local_model if mode == "local" else settings.cloud_model
    return ConfigResponse(mode=mode, model=model)


@router.post("/config", response_model=ConfigResponse)
async def set_config(request: Request, payload: ConfigUpdateRequest) -> ConfigResponse:
    settings = get_settings()
    request.app.state.refactorai_mode = payload.mode
    model = settings.local_model if payload.mode == "local" else settings.cloud_model
    return ConfigResponse(mode=payload.mode, model=model)


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: Request, file: UploadFile = File(...)) -> AnalysisResponse:
    _validate_upload(file)

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max ~2MB).")

    try:
        code = data.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 text.")

    try:
        metas = extract_python_blocks(code)
    except SyntaxError as e:
        raise HTTPException(status_code=400, detail=f"SyntaxError: {e.msg} (line {e.lineno})")

    settings = get_settings()
    mode = _get_app_mode(request, settings.default_mode)

    with tempfile.TemporaryDirectory() as td:
        tmp_path = Path(td) / (file.filename or "uploaded.py")
        tmp_path.write_text(code, encoding="utf-8")
        ruff_issues = await run_ruff_check(str(tmp_path))
        bandit_issues = await run_bandit(str(tmp_path))

    blocks_payload = [
        {
            "block_type": m.block_type,
            "name": m.name,
            "start_line": m.start_line,
            "end_line": m.end_line,
            "original_code": m.original_code,
        }
        for m in metas
    ]

    system = (
        "You are RefactorAI, an expert Python refactoring and security assistant. "
        "Be precise, concrete, and avoid hallucinating external context."
    )
    user = (
        "Analyze the provided Python file. For each block, explain what it does, "
        "list anti-patterns, and give actionable suggestions. Also identify security issues. "
        "Return an overall quality score 0-100, a concise summary, and general optimizations.\n\n"
        f"File name: {file.filename}\n\n"
        "Blocks (do not change start/end lines or original_code; keep original_code exact):\n"
        f"{blocks_payload}"
    )

    try:
        llm_resp = await llm_structured(
            settings=settings,
            mode=mode,
            response_model=AnalysisResponse,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        )
    except LlmNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {type(e).__name__}")

    # Force metadata + source from AST extraction as the source of truth.
    meta_map = {(m.block_type, m.name, m.start_line, m.end_line): m for m in metas}
    fixed_blocks: list[CodeBlock] = []
    for b in llm_resp.blocks:
        key = (b.block_type, b.name, b.start_line, b.end_line)
        m = meta_map.get(key)
        if m is None:
            # If the model drifted, try best-effort match by (type,name).
            m = next((x for x in metas if x.block_type == b.block_type and x.name == b.name), None)
        if m is None:
            continue
        fixed_blocks.append(
            CodeBlock(
                block_type=m.block_type,
                name=m.name,
                start_line=m.start_line,
                end_line=m.end_line,
                original_code=m.original_code,
                explanation=b.explanation.strip(),
                anti_patterns=[s.strip() for s in b.anti_patterns if s.strip()],
                suggestions=[s.strip() for s in b.suggestions if s.strip()],
            )
        )

    security_issues = _dedupe_security([*llm_resp.security_issues, *bandit_issues])
    general = [
        *[s.strip() for s in llm_resp.general_optimizations if s.strip()],
        *_ruff_suggestions(ruff_issues),
    ]

    # Penalize score slightly based on static findings (keeps score stable even if LLM is optimistic).
    penalty = min(len(bandit_issues) * 5 + len(ruff_issues) // 10, 35)
    overall_score = max(0, min(100, int(llm_resp.overall_score) - penalty))

    return AnalysisResponse(
        file_name=file.filename or "uploaded.py",
        overall_score=overall_score,
        blocks=fixed_blocks,
        security_issues=security_issues,
        general_optimizations=general,
        summary=llm_resp.summary.strip(),
    )


@router.post("/refactor", response_model=RefactoredResponse)
async def refactor(request: Request, file: UploadFile = File(...)) -> RefactoredResponse:
    _validate_upload(file)
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max ~2MB).")
    try:
        code = data.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 text.")

    settings = get_settings()
    mode = _get_app_mode(request, settings.default_mode)

    system = (
        "You are RefactorAI, an expert Python performance and maintainability engineer. "
        "Preserve behavior unless the original is clearly buggy; then explain the fix."
    )
    user = (
        "Refactor the following Python file to be cleaner, faster, and PEP8-compliant, with full type hints. "
        "Prefer small, safe transformations. Avoid over-engineering. "
        "Return the full refactored code.\n\n"
        f"File name: {file.filename}\n\n"
        f"Code:\n{code}"
    )

    try:
        rr = await llm_structured(
            settings=settings,
            mode=mode,
            response_model=RefactoredResponse,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        )
    except LlmNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {type(e).__name__}")

    refactored = rr.refactored_code
    # Best-effort formatting (does not fail the request).
    try:
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "refactored.py"
            p.write_text(refactored, encoding="utf-8")
            # Format only; avoid auto-fixing semantics.
            from app.subprocess_utils import run_cmd

            await run_cmd("ruff", "format", str(p), timeout_s=30.0)
            refactored = p.read_text(encoding="utf-8")
    except Exception:
        logger.exception("Ruff formatting failed; returning raw LLM output")

    return RefactoredResponse(
        refactored_code=refactored,
        changes_summary=rr.changes_summary.strip(),
        performance_improvements=[s.strip() for s in rr.performance_improvements if s.strip()],
    )

