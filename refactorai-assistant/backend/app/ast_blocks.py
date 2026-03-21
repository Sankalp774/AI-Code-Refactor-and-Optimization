from __future__ import annotations

import ast
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class BlockMeta:
    block_type: str  # function | class | module | main
    name: str
    start_line: int
    end_line: int
    original_code: str


def _is_main_guard(test: ast.expr) -> bool:
    # if __name__ == "__main__":
    if not isinstance(test, ast.Compare):
        return False
    if not isinstance(test.left, ast.Name) or test.left.id != "__name__":
        return False
    if len(test.ops) != 1 or not isinstance(test.ops[0], ast.Eq):
        return False
    if len(test.comparators) != 1:
        return False
    comp = test.comparators[0]
    if isinstance(comp, ast.Constant) and comp.value == "__main__":
        return True
    return isinstance(comp, ast.Str) and comp.s == "__main__"


def _node_range(node: ast.AST) -> tuple[int, int] | None:
    lineno = getattr(node, "lineno", None)
    end_lineno = getattr(node, "end_lineno", None)
    if lineno is None:
        return None
    if end_lineno is None:
        end_lineno = lineno
    return int(lineno), int(end_lineno)


def _slice_lines(lines: list[str], start_line: int, end_line: int) -> str:
    start_idx = max(start_line - 1, 0)
    end_idx = min(end_line, len(lines))
    return "".join(lines[start_idx:end_idx]).rstrip() + "\n"


def extract_python_blocks(code: str) -> list[BlockMeta]:
    """
    Split python source into logical blocks using `ast`:
    - top-level functions
    - top-level classes
    - main guard block (`if __name__ == "__main__":`)
    - remaining top-level statements grouped into module-level segments
    """
    lines = code.splitlines(keepends=True)
    tree = ast.parse(code)

    blocks: list[BlockMeta] = []
    module_nodes: list[ast.stmt] = []

    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            r = _node_range(node)
            if r is None:
                continue
            start, end = r
            blocks.append(
                BlockMeta(
                    block_type="function",
                    name=node.name,
                    start_line=start,
                    end_line=end,
                    original_code=_slice_lines(lines, start, end),
                )
            )
            continue

        if isinstance(node, ast.ClassDef):
            r = _node_range(node)
            if r is None:
                continue
            start, end = r
            blocks.append(
                BlockMeta(
                    block_type="class",
                    name=node.name,
                    start_line=start,
                    end_line=end,
                    original_code=_slice_lines(lines, start, end),
                )
            )
            continue

        if isinstance(node, ast.If) and _is_main_guard(node.test):
            r = _node_range(node)
            if r is None:
                continue
            start, end = r
            blocks.append(
                BlockMeta(
                    block_type="main",
                    name="__main__",
                    start_line=start,
                    end_line=end,
                    original_code=_slice_lines(lines, start, end),
                )
            )
            continue

        module_nodes.append(node)

    module_nodes_with_range: list[tuple[int, int, ast.stmt]] = []
    for n in module_nodes:
        r = _node_range(n)
        if r is None:
            continue
        module_nodes_with_range.append((r[0], r[1], n))
    module_nodes_with_range.sort(key=lambda t: t[0])

    # Group into module-level segments to avoid mixing unrelated top-level code.
    segments: list[tuple[int, int]] = []
    for start, end, _ in module_nodes_with_range:
        if not segments:
            segments.append((start, end))
            continue
        prev_start, prev_end = segments[-1]
        if start <= prev_end + 1:
            segments[-1] = (prev_start, max(prev_end, end))
        else:
            segments.append((start, end))

    for idx, (start, end) in enumerate(segments, start=1):
        blocks.append(
            BlockMeta(
                block_type="module",
                name=f"module_{idx}",
                start_line=start,
                end_line=end,
                original_code=_slice_lines(lines, start, end),
            )
        )

    # Stable order for UI: module segments first, then class/function/main by appearance.
    blocks.sort(key=lambda b: (b.start_line, b.end_line))
    return blocks

