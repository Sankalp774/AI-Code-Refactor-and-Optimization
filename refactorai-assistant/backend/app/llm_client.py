from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, TypeVar

import instructor
from litellm import acompletion
from pydantic import BaseModel

from app.config import Mode, Settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class LlmNotConfiguredError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class LlmSelection:
    mode: Mode
    model: str
    extra_kwargs: dict[str, Any]


def select_llm(settings: Settings, mode: Mode) -> LlmSelection:
    if mode == "local":
        # Best practice: use `ollama/` prefix and pass api_base to LiteLLM.
        # Some LiteLLM versions also check OLLAMA_API_BASE internally.
        os.environ.setdefault("OLLAMA_API_BASE", settings.ollama_base_url)
        return LlmSelection(
            mode=mode,
            model=settings.local_model,
            extra_kwargs={"api_base": settings.ollama_base_url},
        )

    # Cloud (Groq)
    if not os.getenv("GROQ_API_KEY"):
        raise LlmNotConfiguredError("Missing GROQ_API_KEY for Cloud Mode (Groq).")
    return LlmSelection(mode=mode, model=settings.cloud_model, extra_kwargs={})


_client = instructor.from_litellm(acompletion)


async def llm_structured(
    *,
    settings: Settings,
    mode: Mode,
    response_model: type[T],
    messages: list[dict[str, str]],
) -> T:
    sel = select_llm(settings, mode)
    try:
        return await _client.chat.completions.create(
            model=sel.model,
            response_model=response_model,
            messages=messages,
            max_retries=3,
            **sel.extra_kwargs,
        )
    except Exception:
        logger.exception("LLM call failed", extra={"mode": sel.mode, "model": sel.model})
        raise

