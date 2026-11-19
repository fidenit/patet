"""Command line: check a file of ops, or print the board it builds.

    python -m patet check <file|->     each line that was clipped or rejected, with its line number; exit 1 on a rejection
    python -m patet show <file|->      the resulting board, as ops

The input is plain op lines (author: agent), or a log (SPEC.md 10.2): a `# patet 0.5` header (or the older
`# kite-protocol 0.3`), then `A<tab>op`,
`U<tab>op` and `T<tab>date` lines.
"""

from __future__ import annotations

import sys
from typing import List, Optional

from . import VERSION, Board, can_read, declared_version, serialize, strip_bom

USAGE = "usage: python -m patet check <file|->\n       python -m patet show <file|->\n"


def read_text(path: str) -> str:
    if path == "-":
        data = sys.stdin.buffer.read()
    else:
        with open(path, "rb") as f:
            data = f.read()
    # One byte order mark at the start is dropped; a second one is part of the first line (it is not white space).
    return strip_bom(data.decode("utf-8"))


def main(argv: Optional[List[str]] = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    for stream in (sys.stdout, sys.stderr):
        if not stream.isatty() and hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    if len(argv) != 2 or argv[0] not in ("check", "show"):
        sys.stderr.write(USAGE)
        return 2
    check = argv[0] == "check"
    try:
        # Lines end at a line feed only: U+0085 and U+2028 are white space inside a line, not line ends.
        lines = read_text(argv[1]).split("\n")
    except (OSError, UnicodeDecodeError) as e:
        sys.stderr.write(f"patet: {argv[1]}: {e}\n")
        return 2

    # A header with another major number: the lines after it may not mean the same (SPEC.md, Versioning).
    version = declared_version(lines[0]) if lines else None
    if version is not None and not can_read(version):
        (sys.stdout if check else sys.stderr).write(f"1: this is patet {VERSION}; it cannot read version {version}\n")
        return 1

    board = Board()
    clipped = rejected = applied = 0
    for n, raw in enumerate(lines, 1):
        by, op = "agent", raw
        if raw[:2] in ("A\t", "U\t", "T\t"):  # a log line
            if raw[0] == "T":
                continue
            by, op = ("user" if raw[0] == "U" else "agent"), raw[2:]
        verdict = board.line(op, by)
        if verdict == "skip":
            continue
        if verdict.startswith("err "):
            rejected += 1
        else:
            applied += 1
            clipped += verdict != "ok"
        if check and verdict != "ok":
            print(f"{n}: {verdict}\n    {op.strip()}")
    if check:
        print(f"{applied} applied ({clipped} clipped), {rejected} rejected")
    else:
        sys.stdout.write(serialize(board))
        if rejected:
            sys.stderr.write(f"patet: {rejected} rejected lines were left out\n")
    return 1 if rejected else 0


if __name__ == "__main__":
    sys.exit(main())
