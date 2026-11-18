# KITE Protocol changes

## 0.3 (2026-11-18)

The vocabulary can grow without breaking readers, and a writer can find out what a renderer has.

- **A renderer describes itself** (SPEC.md section 6): the kinds a writer may create and the features it has. Over a line session: `hello`. Over MCP: at the end of `guide`. Over AG-UI: `state.kite.renderer`.
- **Extension kinds.** A kind named `x-<id>` is accepted by every renderer and falls back to a `record` where it is not drawn natively.
- **`record`**: a card with fields the writer names (up to 12) and optional rows.
- **`doc`**: a card that points at a document, file or link outside the board. Long content is pointed at, never pasted.
- **Asking, extended.** `decision` takes `multi` (several answers, `chosen` holds ids joined by `,`; its limit is now 120) and `tone` (`danger`). An `input` box is required when its name ends with `*`, and has two new kinds: `time`, `choice a / b / c`.
- **`\|`** inside a cell is a `|` that does not separate. In a `text` field, `\n` is shown as a line break.
- **`not-allowed`**: a renderer may refuse to let outside writers create `web`, `image` and `doc` cards.
- Versioning: from 0.3 on, a new core card type is a minor change, because writers read the renderer's description.
- A board of 0.2 is read unchanged. A cell that ended in a backslash directly before a `|` now reads differently (`a\|b` is one cell); write a space before the separator.

## 0.2 (2026-11-18)

The protocol becomes a specification of its own, apart from the KITE app.

- **Stable error codes.** A rejection is a code and an English message (`unknown-verb unknown verb 'foo'`). 0.1 gave a free-form Korean sentence. Codes are listed in SPEC.md section 9.
- **Clipping notes** have one form: `clipped <what> <limit>`.
- **Events** are defined: `user <op>`, `input <text>`, `agent <op>`.
- **Line session** (SPEC.md 10.3): replies are `ok`, `ok clipped ...`, `err <code> <message>`. New commands `read [<topic>]`, `watch [all]`, `unwatch`. 0.1 answered `err <line> → <reason>` and had no way to read the board or hear the user.
- **MCP binding** (10.4): tools `screen`, `board_read`, `events`, `guide`.
- **AG-UI binding** (10.5).
- **Conformance cases** and a reference implementation without dependencies (`kite-protocol`).
- **Guide for agents** (GUIDE.md).
- The header reads `# kite-protocol 0.2`. Files and streams of 0.1 are read unchanged: no verb, card type, limit or serialization order changed.

## 0.1 (2026-11-16)

First written description of what KITE 0.3.0 accepted: 19 verbs, 14 card types, the log format, the version header, a one-way line socket.
