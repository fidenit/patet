# PATET

A line language an AI writes to build and edit a screen, and reads back to see what is on it.

```
say Two venues compared. Pick one.
topic ws Team Workshop
card k1 table ws 5x2 Venue comparison
set k1 cols Venue | Travel | Cost per person
add k1 r1 Gangneung | 2h 40m | 180,000 KRW
add k1 r2 Gapyeong | 1h 10m | 120,000 KRW
card k2 decision ws 3x3 Which venue?
add k2 o1 Gangneung | Far, but better facilities
add k2 o2 Gapyeong | Close and cheaper
```

Each line is one op, applied the moment it ends. The result is a board of cards, not a transcript. When the user picks an option, the agent hears it in the same language:

```
user set k2 chosen o2
```

Version **0.5**. Apache-2.0. The protocol is separate from any app: [APERIT](https://github.com/fidenit/aperit) (until now called KITE) is the first product built on it.

## Start here

- **Try it in your browser, nothing to install:** [fidenit.github.io/patet/web](https://fidenit.github.io/patet/web/). Write ops on the left, watch the board, press things and see what comes back.
- **See it work in a minute:** `node examples/assistant/server.mjs`, then open `http://127.0.0.1:8787/`. Two files, no dependencies, a canned answer until you give it a model ([examples/assistant](examples/assistant)).
- **Build it into your product:** [QUICKSTART.md](QUICKSTART.md). The system prompt is a file ([GUIDE.md](GUIDE.md)), a turn has five parts, and each line of the answer gets a verdict.
- **Make it look like yours:** colours, corners and font are CSS variables on [`<patet-board>`](web/README.md#theming).
- **You are a model reading this:** your instructions are [GUIDE.md](GUIDE.md), whole. Answer in ops, one per line.

## Why another protocol

- **It edits; it does not resend.** The board persists. An agent changes a field or an item, and reads the board back in the same ops before it edits. No screen is regenerated per answer.
- **Any model can write it.** Plain lines, no JSON to keep balanced while streaming. A wrong line is rejected with a code and the next line still runs.
- **Cards mean something.** `decision`, `timeline`, `route`, `checklist`: 16 types chosen for what they say, not rows and columns, and a renderer can add kinds of its own. Layout belongs to the renderer.
- **Asking is part of it.** A `decision` or `input` card waits for the user, and the answer comes back as an op.

It sits beside AG-UI, A2UI and MCP rather than against them: an agent can reach a PATET board over MCP or AG-UI today. How it differs from A2UI, json-render, AG-UI, MCP Apps and others, and what it does not do: [COMPARISON.md](COMPARISON.md).

## What is here

| | |
|---|---|
| [SPEC.md](SPEC.md) | The specification: ops, card types, limits, verdicts and codes, events, bindings, security, versioning |
| [GUIDE.md](GUIDE.md) | For agents: how to compose a board that reads at a glance. Give this to your model |
| [COMPARISON.md](COMPARISON.md) | Next to A2UI, json-render, AG-UI, MCP Apps, Adaptive Cards and others: what each is, what differs, when to use which |
| [schema/](schema) | The ops as JSON Schema, for tools that validate or generate them |
| [examples/](examples) | Boards you can load |
| [QUICKSTART.md](QUICKSTART.md) | Ten minutes: make your own model answer with a board |
| [conformance/](conformance) | 37 cases a renderer runs to check itself, with a table of what each covers |
| [grammar/](grammar) | The line syntax as EBNF, and as GBNF for constrained decoding with local models |
| [rust/](rust) | Reference implementation: board, parser, serializer. No dependencies |
| [js/](js) | The same in JavaScript, one file, no dependencies. Runs in a browser, in Node, in a worker |
| [python/](python) | The same in Python (standard library only), with `python -m patet check` to check a saved answer |
| [kotlin/](kotlin) | The same in Kotlin, as used on Android |
| [web/](web) | `<patet-board>`: a renderer for the web, as one custom element you can put in your own app |
| [CHANGELOG.md](CHANGELOG.md) | What changed between versions |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How the language changes, and what "supports PATET" means |

## Use it

**Drive a board from an agent that speaks MCP** (Claude Code, Cursor, your own). Start a renderer with its MCP door open and point the agent at it. The agent gets four tools: `screen`, `board_read`, `events`, `guide`. With the APERIT app: [DRIVING.md](https://github.com/fidenit/aperit/blob/main/docs/DRIVING.md).

**Drive a board from a script.** Open a line session and write ops:

```python
import socket
s = socket.create_connection(("127.0.0.1", 7878))
f = s.makefile("rw", encoding="utf-8", newline="\n")
for line in ["topic demo Demo", "card k1 metric demo 2x2 Users", "set k1 value 42"]:
    f.write(line + "\n"); f.flush(); print(f.readline().strip())   # ok, ok, ok
```

**Drive a board from an AG-UI agent.** Point a renderer at the agent's endpoint. The renderer sends the board, the guide and a `screen` tool with every run ([SPEC.md, section 10.5](SPEC.md#105-ag-ui)).

**Put a board in your web app.** [`<patet-board>`](web) is one custom element with no dependencies:

```html
<script type="module" src="patet-board.js"></script>
<patet-board id="board"></patet-board>
<script type="module">
  board.apply("topic ws Team Workshop");                             // what your agent writes goes in
  board.apply("card k2 decision ws 3x3 Which venue?");
  board.apply("add k2 o1 Gapyeong | Close and cheaper");
  board.addEventListener("patet-event", (e) => send(e.detail.entry));  // "user set k2 chosen o1" comes out
</script>
```

**Write a renderer.** Keep a board, apply lines, draw cards. The parser is about a hundred lines and the checker about three hundred; port [rust/](rust) or use it:

```rust
use patet::{core::{Author, Board}, lang};

let mut board = Board::default();
match lang::parse("card k1 metric trip 2x2 Days left") {
    Ok(Some(op)) => if let Err(e) = board.apply(op, Author::Ai) { eprintln!("err {e}") },
    Ok(None) => {}                      // blank line, comment
    Err(e) => eprintln!("err {e}"),     // err unknown-verb ...
}
println!("{}", lang::serialize(&board));
```

Then run the [conformance cases](conformance).

## Status

0.x: the language may still change between minor versions where the spec says so (section 12). Four implementations pass the 37 conformance cases: Rust (used by APERIT for Windows and macOS), Kotlin (the APERIT Android app), JavaScript (`<patet-board>`) and Python. Feedback, renderers and bindings for other transports are welcome.
