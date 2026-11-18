# PATET changes

## 0.4

The protocol has a name and a home of its own: **PATET** (Latin *patet*: it lies open, it is plain to see), in its own repository. It was "KITE Protocol", a folder inside the KITE app. KITE is now one app built on PATET.

Names on the wire changed with it, so a 0.3 peer has to be updated:

- the version line of a log and the renderer description: `patet 0.4` (was `kite-protocol 0.3`)
- the web element and its event: `<patet-board>`, `patet-event`
- AG-UI: the state key `patet`, the custom event `patet.ops`
- packages: `patet` (Rust, JavaScript)

The language itself (verbs, card types, verdicts, events) is as in 0.3, with two additions from the last days of 0.3: a host should run one more turn at once when lines were rejected, and the guide says that a card needs a topic that exists.

## 0.3 (2026-11-18)

The vocabulary can grow without breaking readers, and a writer can find out what a renderer has.

- **A renderer describes itself** (SPEC.md section 6): the kinds a writer may create and the features it has. Over a line session: `hello`. Over MCP: at the end of `guide`. Over AG-UI: `state.patet.renderer`.
- **Extension kinds.** A kind named `x-<id>` is accepted by every renderer and falls back to a `record` where it is not drawn natively.
- **`record`**: a card with fields the writer names (up to 12) and optional rows.
- **`doc`**: a card that points at a document, file or link outside the board. Long content is pointed at, never pasted.
- **Asking, extended.** `decision` takes `multi` (several answers, `chosen` holds ids joined by `,`; its limit is now 120) and `tone` (`danger`). An `input` box is required when its name ends with `*`, and has two new kinds: `time`, `choice a / b / c`.
- **`\|`** inside a cell is a `|` that does not separate. In a `text` field, `\n` is shown as a line break.
- **`not-allowed`**: a renderer may refuse to let outside writers create `web`, `image` and `doc` cards.
- **The user's answers are the user's.** An agent's op that sets `chosen` or `sent`, or writes the value cell of an input box, is rejected with `user-only`. (Found by a model that answered its own questions.)
- **A turn for a model, written down** (SPEC.md 10.1): `<board>`, `<events>`, `<rejected>`, `<earlier>`, `<input>`, and what goes wrong without each. The guide describes the same layout, so it works as a system prompt as it is.
- The guide says how to react to a sent form, with a worked example, and keeps tool advice in a section of its own.
- `card` takes an optional title, as implementations always did.
- Versioning: from 0.3 on, a new core card type is a minor change, because writers read the renderer's description.
- A board of 0.2 is read unchanged. A cell that ended in a backslash directly before a `|` now reads differently (`a\|b` is one cell); write a space before the separator.
- A host should run one more turn at once when lines of a turn were rejected (SPEC 10.1), and the guide says that a card needs a topic that exists. Found with an app built from the protocol alone: a greeting was answered with a card in a topic that did not exist, and the user saw an empty board.

## 0.2 (2026-11-18)

The protocol becomes a specification of its own, apart from the KITE app.

- **Stable error codes.** A rejection is a code and an English message (`unknown-verb unknown verb 'foo'`). 0.1 gave a free-form Korean sentence. Codes are listed in SPEC.md section 9.
- **Clipping notes** have one form: `clipped <what> <limit>`.
- **Events** are defined: `user <op>`, `input <text>`, `agent <op>`.
- **Line session** (SPEC.md 10.3): replies are `ok`, `ok clipped ...`, `err <code> <message>`. New commands `read [<topic>]`, `watch [all]`, `unwatch`. 0.1 answered `err <line> → <reason>` and had no way to read the board or hear the user.
- **MCP binding** (10.4): tools `screen`, `board_read`, `events`, `guide`.
- **AG-UI binding** (10.5).
- **Conformance cases** and a reference implementation without dependencies (`patet`).
- **Guide for agents** (GUIDE.md).
- The header reads `# patet 0.2`. Files and streams of 0.1 are read unchanged: no verb, card type, limit or serialization order changed.

## 0.1 (2026-11-16)

First written description of what KITE 0.3.0 accepted: 19 verbs, 14 card types, the log format, the version header, a one-way line socket.
