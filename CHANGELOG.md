# PATET changes

## 0.5

One addition: **`by`, who wrote a card.** Every card has the field `by` (24 characters), like `title`: the name its writer goes by. When several writers share a board (an assistant and the workers it sends out, two agents in one renderer), the user can tell their cards apart. A writer sharing a board sets it; a renderer shows it when a board names more than one writer, never as a record's own field, and may set it itself for a writer it can tell apart. It does not count toward a record's 12 fields. Case 37. A 0.4 renderer rejects `set <id> by ...` with `unknown-field` and keeps the rest.

## 0.4

The protocol has a name and a home of its own: **PATET** (Latin *patet*: it lies open, it is plain to see), in its own repository. It was "KITE Protocol", a folder inside the KITE app. KITE is now one app built on PATET.

Names on the wire changed with it, so a 0.3 peer has to be updated:

- the version line of a log and the renderer description: `patet 0.4` (was `kite-protocol 0.3`)
- the web element and its event: `<patet-board>`, `patet-event`
- AG-UI: the state key `patet`, the custom event `patet.ops`
- packages: `patet` (Rust, JavaScript)

The verbs, the card types, the verdicts and the events are those of 0.3. Writing 36 conformance cases (there were 8) and a fourth implementation showed where the specification and the implementations disagreed; those points are settled below. Two additions from the last days of 0.3 are also in: a host should run one more turn at once when lines were rejected, and the guide says that a card needs a topic that exists.

Settled in 0.4: points the specification left open or said two ways, found by running two implementations against cases written to its letter. Each is now stated in SPEC.md and pinned by a conformance case.

- `size` and `move` answer `bad-syntax`, not `missing-argument`, when a size, a column or a row is absent (section 5; case 27).
- `set <id> <field>` with no value sets the field to the empty text (section 5; case 28).
- `group` cannot take the id of a topic or card on the shelf: `shelved` (sections 4 and 5; case 29). Implementations accepted it.
- The name of an extension kind is at most 24 characters, `x-` included (section 6; case 30).
- A third author, `restore`, loads a serialized board: the user's rights, but its `move` and `size` do not pin. Read back as the user, a card an agent had placed came back pinned (section 8; case 31).
- A number in a chart or a route has one written form and must be finite: no `inf`, `nan`, `0x10`, `1e400` (section 6; case 32). Implementations took whatever their language's parser took.
- A size is ASCII digits without a sign, however large; a column or row of `move` is 0 to 9999 in ASCII digits. A negative one is now `bad-syntax` and no longer becomes 0 (section 5; case 33).
- An id character is an ASCII letter or digit, `_`, `-`, or any character above U+007F that is neither white space nor a control character, so every implementation can test it without Unicode tables. Words with combining marks are ids; so are symbols such as an emoji (section 4; case 34).
- White space is the Unicode property White_Space, 25 characters. U+FEFF is not white space; one at the very start of a file or stream is dropped (sections 3 and 10.2; case 35).
- "By name" is code point order, not UTF-16 unit order (section 8; case 36).
- A clipped topic or group name has no note; every other clipped text has one (sections 4 and 9; case 13).

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
