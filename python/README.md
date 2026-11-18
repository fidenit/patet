# patet (Python)

[PATET](https://github.com/fidenit/patet) 0.4 in Python: the board, the parser and the serializer. PATET is a line language an AI writes to build and edit a board of cards, and reads back to see what is on it. No dependencies; Python 3.9 or later.

```
pip install patet
```

## Quickstart

Feed what the model generates through a `LineStream`, apply each finished line to a `Board`, and keep the verdicts that are not `ok` for the model's next turn.

```python
from patet import Board, LineStream, serialize

board, stream, rejected = Board(), LineStream(), []

def apply(line):
    verdict = board.line(line)              # "ok" | "ok clipped ..." | "err <code> <message>" | "skip"
    if verdict not in ("ok", "skip"):
        rejected.append(f"{line} → {verdict.split(' ', 1)[1]}")

for delta in ["topic ws Team Work", "shop\ncard k2 decision ws Which venue?\nadd k2 o1 Gang", "neung\nadd k2 o2 Gapyeong"]:
    for line in stream.feed(delta):         # the lines that ended in this piece of the stream
        apply(line)
if (last := stream.finish()) is not None:   # the stream ended without a newline
    apply(last)

events = []                                 # what the user does comes back in the same language
if board.line("set k2 chosen o2", by="user") == "ok":
    events.append("user set k2 chosen o2")

print(serialize(board))                     # the board as ops: the <board> part of the next turn
```

`rejected` and `events` are the `<rejected>` and `<events>` parts of the next turn ([SPEC.md](https://github.com/fidenit/patet/blob/main/SPEC.md), section 10.1). The instructions to give the model are [GUIDE.md](https://github.com/fidenit/patet/blob/main/GUIDE.md).

## What is in the package

| | |
|---|---|
| `Board` | the board: `line(text, by="agent")` returns a verdict; `apply(op, by)` raises `Reject`; `cards`, `topics`, `groups`, `vars`, `say`, `focus`, `shelf`; `card(id)`; `show(text)` fills in `{name}` values |
| `parse(line)` | one line as an op (a dict), `None` for a line that is skipped; raises `Reject` (`.code`, `.message`) |
| `serialize(board, topic=None)` | the board, or one topic, as ops |
| `LineStream` | cuts a token stream into lines: `feed(delta)`, `partial`, `finish()` |
| `split_cells`, `join_cells` | item cells and the `\|` escape |
| `PARTS`, `parts_table()`, `kind_names()`, `LIMITS` | the 16 card types and the limits |
| `VERSION`, `header()`, `declared_version(line)`, `can_read(version)` | the protocol version and the `# patet 0.4` header (the older `# kite-protocol 0.3` is read too) |
| `strip_bom(text)` | drops one leading U+FEFF; call it on a file or stream you read yourself, before the first line |

A rejected op changes nothing, and the line after it still runs. Limits count Unicode characters, not bytes.

## Command line

```
python -m patet check board.ops     # every clipped or rejected line with its line number; exit 1 on a rejection
python -m patet check -             # the same, from standard input
python -m patet show board.ops      # the board the file builds, as ops
```

The file is plain op lines, or a log (`# patet 0.4`, then `A<tab>op`, `U<tab>op`, `T<tab>date`).

## Tests

From the repository root, the conformance cases, the examples and the guide's card table:

```
python -m unittest discover -s python/tests
```

Apache-2.0.
