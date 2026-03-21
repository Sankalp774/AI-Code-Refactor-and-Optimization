from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class CodeBlock(BaseModel):
    block_type: str  # function | class | module | main
    name: str
    start_line: int
    end_line: int
    original_code: str
    explanation: str
    anti_patterns: list[str]
    suggestions: list[str]


class SecurityIssue(BaseModel):
    severity: Literal["low", "medium", "high", "critical"]
    description: str
    location: str
    bandit_finding: dict | None = None


class AnalysisResponse(BaseModel):
    file_name: str
    overall_score: int = Field(ge=0, le=100)
    blocks: list[CodeBlock]
    security_issues: list[SecurityIssue]
    general_optimizations: list[str]
    summary: str


class RefactoredResponse(BaseModel):
    refactored_code: str
    changes_summary: str
    performance_improvements: list[str]

