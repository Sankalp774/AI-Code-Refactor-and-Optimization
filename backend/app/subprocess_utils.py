from __future__ import annotations

import asyncio
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class CmdResult:
    stdout: str
    stderr: str
    exit_code: int


async def run_cmd(*args: str, timeout_s: float = 30.0) -> CmdResult:
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
    except TimeoutError:
        proc.kill()
        stdout_b, stderr_b = await proc.communicate()
        return CmdResult(stdout=stdout_b.decode(), stderr=stderr_b.decode(), exit_code=124)
    return CmdResult(
        stdout=stdout_b.decode(),
        stderr=stderr_b.decode(),
        exit_code=int(proc.returncode or 0),
    )

