from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Literal, cast

from app.models import SecurityIssue
from app.subprocess_utils import run_cmd

Severity = Literal["low", "medium", "high", "critical"]

@dataclass(frozen=True, slots=True)
class RuffIssue:
    code: str
    message: str
    line: int
    column: int


async def run_ruff_check(file_path: str) -> list[RuffIssue]:
    # Exit codes indicate lint presence; we parse JSON regardless.
    res = await run_cmd(
        "ruff",
        "check",
        "--output-format=json",
        "--no-cache",
        "--exit-zero",
        file_path,
        timeout_s=30.0,
    )
    try:
        data = json.loads(res.stdout) if res.stdout.strip() else []
    except json.JSONDecodeError:
        return []

    issues: list[RuffIssue] = []
    for item in data:
        try:
            issues.append(
                RuffIssue(
                    code=str(item.get("code") or ""),
                    message=str(item.get("message") or ""),
                    line=int(item["location"]["row"]),
                    column=int(item["location"]["column"]),
                )
            )
        except Exception:
            continue
    return issues


def _bandit_severity(s: str) -> Severity:
    s_up = s.strip().lower()
    if s_up in {"low", "medium", "high"}:
        return cast(Severity, s_up)
    return "low"


async def run_bandit(file_path: str) -> list[SecurityIssue]:
    res = await run_cmd(
        "bandit",
        "-f",
        "json",
        "-q",
        file_path,
        timeout_s=60.0,
    )
    try:
        data = json.loads(res.stdout) if res.stdout.strip() else {}
    except json.JSONDecodeError:
        return []

    issues: list[SecurityIssue] = []
    for r in data.get("results", []) or []:
        sev = _bandit_severity(str(r.get("issue_severity", "low")))
        line = r.get("line_number")
        location = f"line {line}" if line else "unknown"
        test_id = r.get("test_id")
        if test_id:
            location = f"{location} ({test_id})"
        issues.append(
            SecurityIssue(
                severity=sev,
                description=str(r.get("issue_text") or "Bandit finding"),
                location=location,
                bandit_finding=r,
            )
        )
    return issues

