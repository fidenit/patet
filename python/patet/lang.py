"""The line language. One line is one op, applied the moment the line ends."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

#: The protocol version this implementation writes and reads (SPEC.md, Versioning).
VERSION = "0.5"

# What counts as white space: the Unicode White_Space property, as in the reference implementation.
# (str.strip() and \s in Python also take U+001C..U+001F, which the protocol does not.)
WS = "".join(map(chr, [0x0009, 0x000A, 0x000B, 0x000C, 0x000D, 0x0020, 0x0085, 0x00A0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000]))
_WS_RE = re.compile("[" + WS + "]")
_SIZE_RE = re.compile(r"([0-9]+)[xX]([0-9]+)")
_INT_RE = re.compile(r"[0-9]+")

Op = Dict[str, Any]


class Reject(Exception):
    """Why an op was not applied: a stable code for programs, an English message for whoever wrote the line."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message

    @property
    def line(self) -> str:
        """The verdict as the protocol writes it, without the leading ``err``."""
        return f"{self.code} {self.message}"

    def __str__(self) -> str:
        return self.line


def header() -> str:
    """First line of a saved log or a stream. It starts with ``#``, so an older parser reads a comment."""
    return f"# patet {VERSION}"


def declared_version(line: str) -> Optional[str]:
    """The version a header line declares, or None when the line is not a header."""
    line = line.strip(WS)
    if not line.startswith("#"):
        return None
    rest = line[1:].lstrip(WS)
    # Up to 0.3 the protocol was called KITE Protocol; files written then are still read.
    name = next((n for n in ("patet", "kite-protocol") if rest.startswith(n)), None)
    if name is None:
        return None
    rest = rest[len(name):]
    if rest == "" or rest[0] not in WS:
        return None
    return split1(rest)[0] or None


def can_read(version: str) -> bool:
    """Can this implementation read that version? Yes when the major number (the first one) is the same."""
    major = version.split(".")[0]
    return re.fullmatch(r"\+?[0-9]+", major) is not None and int(major) == int(VERSION.split(".")[0])


def split1(s: str) -> Tuple[str, str]:
    """The first word and what follows it."""
    s = s.lstrip(WS)
    m = _WS_RE.search(s)
    if m is None:
        return s, ""
    return s[: m.start()], s[m.start():].lstrip(WS)


def _need(s: str, usage: str) -> str:
    if s == "":
        raise Reject("missing-argument", f"expected: {usage}")
    return s


def _parse_size(s: str) -> Optional[Tuple[int, int]]:
    m = _SIZE_RE.fullmatch(s)
    if m is None:
        return None
    w, h = int(m.group(1)), int(m.group(2))
    # However large, it is a size: the board clamps it.
    return min(w, 255), min(h, 255)


def _position(s: str) -> Optional[int]:
    # A column or a row: ASCII digits without a sign (leading zeros are allowed), 0 to 9999.
    if not _INT_RE.fullmatch(s):
        return None
    n = int(s)
    return n if n <= 9999 else None


def strip_bom(text: str) -> str:
    """Drop one leading U+FEFF: whoever reads a file or a stream does this before the first line.

    U+FEFF is not white space, so a line that keeps it starts with an unknown verb.
    """
    return text[1:] if text.startswith("﻿") else text


def split_cells(rest: str) -> List[str]:
    r"""Split a value into cells at ``|``. Inside a cell, ``\|`` is a ``|`` that does not split."""
    out: List[str] = []
    cur: List[str] = []
    i, n = 0, len(rest)
    while i < n:
        c = rest[i]
        if c == "\\" and i + 1 < n and rest[i + 1] == "|":
            cur.append("|")
            i += 1
        elif c == "|":
            out.append("".join(cur).strip(WS))
            cur = []
        else:
            cur.append(c)
        i += 1
    out.append("".join(cur).strip(WS))
    return out


def join_cells(cells: List[str]) -> str:
    r"""Write cells back as one value: joined by `` | ``, a ``|`` inside a cell written as ``\|``."""
    return " | ".join(c.replace("|", "\\|") for c in cells)


def is_blank(line: str) -> bool:
    """Is this line skipped without a verdict? Blank lines, ``#`` comments and code fences are."""
    line = line.strip(WS)
    return line == "" or line.startswith("#") or line.startswith("```")


def parse(raw: str) -> Optional[Op]:
    """Parse one line into an op (a dict with an ``op`` key).

    Blank lines, comments, code fences and ``tell`` give None. Raises :class:`Reject`.
    """
    line = raw.strip(WS)
    if is_blank(line):
        return None
    cmd, rest = split1(line)
    if cmd == "topic":
        id_, name = split1(rest)
        return {"op": "topic", "id": _need(id_, "topic <id> <name>"), "name": name}
    if cmd == "group":
        id_, name = split1(rest)
        return {"op": "group", "id": _need(id_, "group <id> <name>"), "name": name}
    if cmd == "mv":
        card, topic = split1(rest)
        return {"op": "mv", "card": _need(card, "mv <card> <topic>"), "topic": _need(topic, "mv <card> <topic>")}
    if cmd == "put":
        topic, group = split1(rest)
        return {"op": "put", "topic": _need(topic, "put <topic> <group>"), "group": _need(group, "put <topic> <group>")}
    if cmd == "card":
        id_, r1 = split1(rest)
        kind, r2 = split1(r1)
        topic, r3 = split1(r2)
        _need(topic, "card <id> <kind> <topic> [<w>x<h>] <title>")
        maybe, after = split1(r3)  # the size is optional
        size = _parse_size(maybe)
        return {"op": "card", "id": id_, "kind": kind, "topic": topic, "size": size, "title": after if size else r3}
    if cmd == "set":
        id_, r1 = split1(rest)
        field, value = split1(r1)
        return {"op": "set", "id": id_, "field": _need(field, "set <id> <field> <value>"), "value": value}
    if cmd in ("add", "upd"):
        usage = f"{cmd} <id> <item> <cell> | <cell> ..."
        id_, r1 = split1(rest)
        item, r2 = split1(r1)
        _need(item, usage)
        return {"op": cmd, "id": id_, "item": item, "cells": split_cells(_need(r2, usage))}
    if cmd == "del":
        id_, item = split1(rest)
        return {"op": "del", "id": _need(id_, "del <id> [<item>]"), "item": item or None}
    if cmd == "size":
        id_, s = split1(rest)
        size = _parse_size(s)
        if size is None:
            raise Reject("bad-syntax", "expected: size <id> <w>x<h>")
        return {"op": "size", "id": id_, "w": size[0], "h": size[1]}
    if cmd == "move":
        id_, r1 = split1(rest)
        c, r = split1(r1)
        col, row = _position(c), _position(r)
        if col is None or row is None:
            raise Reject("bad-syntax", "expected: move <id> <col> <row>")
        return {"op": "move", "id": id_, "col": col, "row": row}
    if cmd == "let":
        name, value = split1(rest)
        return {"op": "let", "name": _need(name, "let <name> <value>"), "value": value}
    if cmd == "archive":
        return {"op": "archive", "topic": _need(rest, "archive <topic>")}
    if cmd == "restore":
        return {"op": "restore", "topic": _need(rest, "restore <topic>")}
    if cmd in ("pin", "unpin"):
        return {"op": "pin", "id": _need(rest, "pin <id>"), "on": cmd == "pin"}
    if cmd == "focus":
        return {"op": "focus", "id": _need(rest, "focus <id>")}
    if cmd == "say":
        return {"op": "say", "text": rest}
    if cmd == "tell":
        return None  # read aloud by a renderer with a voice; changes no board
    raise Reject("unknown-verb", f"unknown verb '{cmd}'")


class LineStream:
    """Cuts a stream of text into lines: ``feed`` returns the lines that ended, ``partial`` is the line still arriving."""

    def __init__(self) -> None:
        self.partial = ""
        self.started = False

    def feed(self, delta: str) -> List[str]:
        self.partial += delta
        # One U+FEFF at the very start of a stream or file is a byte order mark, not text (SPEC.md 10.2).
        if not self.started and self.partial != "":
            self.started = True
            self.partial = strip_bom(self.partial)
        if "\n" not in self.partial:
            return []
        *done, self.partial = self.partial.split("\n")
        return [line.rstrip(WS) for line in done]

    def finish(self) -> Optional[str]:
        """The last line when the stream ended without a newline, or None."""
        rest, self.partial = self.partial, ""
        return None if rest.strip(WS) == "" else rest
