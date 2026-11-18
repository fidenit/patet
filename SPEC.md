# KITE Protocol 0.3

A line language an AI writes to build and edit a screen, and reads back to see what is on it.

This document is the specification. It says what a writer (a model, an agent, a program) may send and what a renderer (an app that draws the board) must do with it. It is independent of any one app. [GUIDE.md](GUIDE.md) is the companion for writers: how to compose a board that reads at a glance. Machine-readable form: [schema/protocol.schema.json](schema/protocol.schema.json). Test vectors: [conformance/](conformance). Reference implementation: [rust/](rust).

The words MUST, SHOULD and MAY are used as in RFC 2119.

## 1. Purpose

Chat puts an AI's answer in a scroll of paragraphs. KITE puts it on a board: a few cards, each shaped to its content, that the AI keeps editing as the work moves. The protocol is what makes that possible with any model and any app.

It rests on four choices.

- **Edits, not documents.** A writer sends small ops (`set`, `add`, `del`) against a board that persists. It does not resend the screen. The board is the present state of the work, not a transcript.
- **Lines.** One op is one line of plain text. It is applied the moment the line ends, so a screen fills in while the model is still writing, and a model needs no JSON discipline to produce it.
- **A closed set of meaningful cards.** A writer picks from card types such as `decision`, `timeline` or `route`, not from layout primitives. Placement, sizing to fit, and bringing a question to the user are the renderer's job.
- **The board reads back in the same language.** Whoever is about to edit it can be shown the exact ops that would rebuild it. A writer keeps no memory of the screen.

## 2. The board

A board is a tree.

```
group  ->  topic  ->  card  ->  item
(<= 8)                (16 types)  (<= 24 per card)
```

- A **topic** is one subject of work and holds cards.
- A **group** is a broad area that holds topics. Groups are optional.
- A **card** has a type, a title, fields (name and value) and, for list-like types, items.
- An **item** has an id and 1 to 6 cells.
- A board also holds **named values**, a **shelf** of archived topics, one **caption** (`say`) and at most one **focused** card.

Every change has an **author**: `agent` (a model, or a program writing for one) or `user` (a gesture on the renderer). A few ops depend on the author (section 5).

## 3. Lines

- UTF-8. One op per line. A line ends at `\n`. A renderer MUST apply an op when its line ends, before reading the next.
- A trailing `\r` and surrounding spaces are trimmed.
- Blank lines, lines starting with `#`, and lines starting with three backticks are skipped without a verdict. `#` is the comment mark.
- A last line without `\n` is applied when the stream ends.
- Tokens are separated by whitespace. The first token is the verb.
- A value runs to the end of its line, so it cannot contain a line break.
- Cells are separated by `|`. Inside a cell, `\|` is a `|` that does not separate; a backslash anywhere else is an ordinary character. A serializer MUST write a `|` inside a cell as `\|`.
- In a field named `text`, a renderer SHOULD show the two characters `\n` as a line break. The stored value keeps them.
- A renderer MAY show the text of `say` and of `set <id> text` while its line is still arriving.

## 4. Names and limits

| Thing | Rule |
|---|---|
| id (topic, group, card, item, named value) | 1 to 24 characters: Unicode letters or digits, `_`, `-` |
| topic name | 24 characters; empty means the id |
| group name | 16 characters; empty means the id; at most 8 groups |
| card title | 40 characters |
| field value | the limit of that field (section 6) |
| item cell | 60 characters |
| cells per item | 1 to 6 |
| items per card | 24 (80 for `draw`) |
| card size | 1 to 8 columns and rows; a value outside is clamped |
| `say` | 80 characters |
| named values | 64 names; a value is 60 characters |

Text over a limit is **clipped**, not rejected: it is cut to the limit with `…` as its last character, the op is applied, and the writer is told (section 9). Lengths are counted in Unicode scalar values.

Ids of topics, groups and cards SHOULD be unique across all three kinds. A renderer MUST reject a `group` whose id is already a topic or card id. Ids of topics and cards on the shelf stay reserved until restored.

## 5. Ops

19 verbs. `<x>` is required, `[x]` optional.

| Verb | Syntax | Effect | Rejected when (code) |
|---|---|---|---|
| `topic` | `topic <id> <name>` | Create a topic, or rename it | `bad-id`; id is on the shelf (`shelved`) |
| `group` | `group <id> <name>` | Create a group, or rename it | `bad-id`; id is a topic or card (`id-in-use`); 9th group (`limit`) |
| `put` | `put <topic> <group>` | Place a topic in a group | `no-such-group`, `no-such-topic` |
| `card` | `card <id> <kind> <topic> [<w>x<h>] <title>` | Create a card | id exists (`exists`); `bad-id`; id is on the shelf (`shelved`); `unknown-kind`; `no-such-topic`; the renderer does not let this writer create that kind (`not-allowed`) |
| `set` | `set <id> <field> <value>` | Set one field; `title` is a field of every card | `no-such-card`; `unknown-field`; value fails the field's check (`bad-value`) |
| `add` | `add <id> <item> <cell> \| <cell> ...` | Add an item; an existing item id is replaced | `no-such-card`; type takes no items (`no-items`); `bad-id`; `cell-count`; a cell fails its check (`bad-value`); item limit (`limit`) |
| `upd` | `upd <id> <item> <cell> \| <cell> ...` | Replace an existing item | as `add`, and `no-such-item` |
| `del` | `del <id> [<item>]` | With an item: remove it. Without: remove the card, else the empty topic, else the group | `no-such-item`; nothing has that id (`not-found`); topic still has cards (`not-empty`) |
| `mv` | `mv <card> <topic>` | Move a card to another topic; clears its position and pin | `no-such-topic`, `no-such-card` |
| `size` | `size <id> <w>x<h>` | Resize a card | `no-such-card`; pinned and author is agent (`pinned`); `bad-syntax` |
| `move` | `move <id> <col> <row>` | Place a card at a grid cell; negatives become 0 | `no-such-card`; pinned and author is agent (`pinned`); `bad-syntax` |
| `pin` | `pin <id>` | Lock position and size | author is agent (`user-only`); `no-such-card` |
| `unpin` | `unpin <id>` | Unlock; clears the position | author is agent (`user-only`); `no-such-card` |
| `focus` | `focus <id>` | Mark the card to look at | `no-such-card` |
| `let` | `let <name> <value>` | Set a named value; an empty value removes it | `bad-id`; 65th name (`limit`) |
| `archive` | `archive <topic>` | Shelve the topic with its cards | `no-such-topic` |
| `restore` | `restore <topic>` | Bring a shelved topic back | not on the shelf (`not-shelved`) |
| `say` | `say <text>` | The one-line caption | never |
| `tell` | `tell <text>` | A sentence to read aloud; changes no board | never |

A line missing a required argument is rejected with `missing-argument`; an unknown first token with `unknown-verb`.

Details that are easy to miss:

- `card` on an existing id is rejected: a writer changes a card with `set`, `add`, `upd`, and does not recreate it. `add` on an existing item id overwrites. `topic` and `group` on an existing id rename.
- In `card`, the token after the topic is the size if it has the form `<w>x<h>` (two integers joined by `x` or `X`); otherwise it starts the title. Without a size the type's default applies.
- `del <id>` looks the id up as a card first, then a topic, then a group. Deleting a group leaves its topics without a group.
- **Pinning.** When the user moves or resizes a card it becomes pinned. An agent's `move` and `size` on a pinned card are rejected; its content ops still apply. Only the user pins and unpins.
- `focus` and `say` are not part of the serialized board (section 8).
- `{name}` in a title, a field or a cell shows the value set by `let`. The renderer substitutes at draw time; the stored text keeps `{name}`.
- A renderer without a voice ignores `tell`.

## 6. Card types

16 core types, and extension kinds (below). Every card also has `title` (40). "Default" is columns x rows. "Checked" is what a renderer MUST reject with `bad-value`; anything else is only clipped.

| Type | Default | Fields (limit) | Item cells | Checked |
|---|---|---|---|---|
| `status` | 2x1 | `state` (8), `text` (80) | none | `state` is `ok` `run` `wait` `fail` `idle` |
| `metric` | 2x2 | `value` (14), `unit` (8), `delta` (14), `text` (60) | none | |
| `chart` | 4x3 | `unit` (8), `form` (8) | `name \| number` | cell 2 is a number (commas allowed) |
| `route` | 6x5 | `total` (40), `text` (80) | `name \| lat,lon \| distance and time to the next stop` | cell 2 is two numbers joined by a comma |
| `draw` | 5x4 | `text` (80) | `shape \| coordinates \| text \| color \| size` | cell 1 is `line` `arrow` `rect` `circle` `text` |
| `image` | 4x3 | `src` (600), `text` (80) | none | |
| `table` | 4x3 | `cols` (200) | up to 6 cells | |
| `progress` | 3x3 | `pct` (3), `text` (60) | `done\|run\|todo\|fail \| step` | `pct` is an integer 0 to 100; cell 1 |
| `checklist` | 3x3 | none | `done\|todo \| text` | cell 1 |
| `decision` | 3x3 | `text` (120), `multi` (8), `tone` (8), `chosen` (120) | `option \| one-line description` | `multi` is `yes` `no`; `tone` is `normal` `danger` |
| `input` | 3x3 | `text` (120), `sent` (8) | `box name \| hint or kind` | |
| `timeline` | 3x3 | none | `when \| text \| done\|run\|todo` (cell 3 optional) | |
| `note` | 3x2 | `text` (240) | none | |
| `web` | 6x5 | `url` (600) | none | |
| `record` | 3x3 | `text` (240), `cols` (200), and any other field name that is a valid id (80 each); at most 12 fields | up to 6 cells | |
| `doc` | 3x2 | `src` (600), `text` (240) | none | |

Meaning per type:

- **status**: one state with a line of text.
- **metric**: one number. A `delta` that starts with `+` or `-` is drawn in a color.
- **chart**: `form` is `bar` (the default), `line` or `donut`. Items are drawn in order.
- **route**: stops in order. Cell 2 is `lat,lon`. Cell 3 describes the leg to the next stop and is absent on the last stop. At least two stops make a path. A renderer draws straight legs unless it knows the road.
- **draw**: the inside of the card is 0 to 100 in both directions, origin at the top left. `rect` is `x,y w,h`; `circle` is `x,y r`; `line` and `arrow` list points `x,y x,y ...`; `text` is `x,y`. Colors: empty, `accent`, `green`, `red`, `amber`, `dim`, `faint`, `white`. Text size: `s`, empty, `l`. A renderer SHOULD draw an unknown color or size as the default.
- **image**: `src` is the address of a picture, or an absolute path on the renderer's machine.
- **table**: `cols` holds the column names separated by `|`.
- **progress**: `pct` is the whole; items are steps with a state.
- **checklist**: the user can tick items (section 9).
- **decision**: asks the user to pick one item. The renderer writes the picked item id to `chosen`. With `multi` set to `yes` the user may pick several, and `chosen` holds their ids joined by `,` in item order. `tone` set to `danger` marks a choice that cannot be undone; a renderer SHOULD make it look so.
- **input**: asks the user for values. Each item is a box. A box whose name ends with `*` must be filled before the card can be sent. Cell 2 is a hint, or a kind: `date`, `time`, `number`, `slider <lo>~<hi> <unit>`, or `choice <a> / <b> / ...` (one of the listed values). A renderer shows a kind it does not know as a free text box. When the user sends the card the renderer writes each value as cell 3 and sets `sent` to `yes`.
- **timeline**: entries in the order given.
- **note**: a short text.
- **web**: `url` is a web address, or an absolute path on the renderer's machine.
- **record**: one thing with properties the writer names. Fields are shown as label and value in field-name order; items, if any, are rows, with `cols` naming the columns.
- **doc**: something that lives outside the board: `src` is an absolute path on the renderer's machine or an address, `text` says what it is. A renderer shows its name and summary and lets the user open it. This is how long content reaches the user: the board points at it and does not contain it.

`decision` and `input` are the **asking types**: they wait for the user. A renderer SHOULD bring asking cards to the user's attention one at a time.

### Extension kinds

A kind named `x-` followed by an id (`x-kanban`) is an extension kind, whose meaning is agreed between a writer and a renderer outside this document.

- Every renderer MUST accept a card of an extension kind and check it as a `record`: any field name, rows of up to 6 cells.
- A renderer that draws that kind itself MAY do so; any other MUST draw it as a `record`. Either way the card is serialized with its own kind name.
- A kind name that is neither a core type nor an extension kind is rejected with `unknown-kind`.

### What a renderer supports

A renderer need not support every core type (a phone may have no `web`), and may forbid some to writers outside its own process (section 11). It says what a writer may use in a **description**, a few lines of the form `<key> <values>`:

```
kite-protocol 0.3
renderer KITE 0.4.0
kinds status metric chart route draw image table progress checklist decision input timeline note record doc
features tell
```

| Key | Values |
|---|---|
| `kite-protocol` | the version it speaks |
| `renderer` | its name and version; free text |
| `kinds` | the kinds this writer may create: core types and the extension kinds the renderer draws itself |
| `features` | `tell` when it can read aloud; a renderer may add words of its own |

A reader ignores keys it does not know. A writer SHOULD create only the kinds listed, and one that was given no description assumes the 14 types of version 0.1 and no features. How the description travels is up to the binding (section 10).

## 7. Layout

Placement is the renderer's. `size` and `move` are hints, and the user's gestures win (section 5, pinning). When a topic has more cards than fit at a readable size, a renderer SHOULD keep the focused card, asking cards and pinned cards in view and fold the rest away rather than shrink text. A writer SHOULD normally send neither `move` nor `size` after creating a card, and SHOULD create the most important card of a topic first.

## 8. Reading the board

A board is written back in the same language, in this order:

1. `let <name> <value>` for each named value, by name.
2. `group <id> <name>` for each group, in creation order.
3. For each topic in creation order: `topic <id> <name>`, then `put <topic> <group>` if it is in one.
4. For each card in creation order: `card <id> <kind> <topic> <w>x<h> <title>`, then its `set` lines by field name, then its `add` lines in item order, then `move <id> <col> <row>` if placed, then `pin <id>` if pinned.

Applying these lines in order to an empty board with author `user` MUST give the same board. (With author `agent` the `pin` lines are rejected.)

Not written: `say`, `focus`, the shelf.

A renderer MAY shorten a large board for a model: it leaves out the cards of a topic, or their fields and items, and adds a line starting with `#` that says so. A reader MUST treat a `#` line as a note, never as data, and MUST NOT write it back.

## 9. Verdicts and events

### Verdicts

Every op line gets one verdict.

- **Applied.**
- **Applied with a note.** The only note is `clipped <what> <limit>`: text was cut to `<limit>` characters. `<what>` is `<card>.<field>`, `<card>.title`, `<card>.<item>`, `let.<name>` or `say`.
- **Rejected**, with a code and an English message. A rejected op changes nothing. The line after it still runs: errors are per line, never per stream.

Codes are stable; messages are for a model or a person to read and may change.

| Code | Meaning |
|---|---|
| `unknown-verb` | the first token is not a verb |
| `missing-argument` | a required argument is absent |
| `bad-syntax` | an argument has the wrong form (`size`, `move`, session commands) |
| `bad-id` | an id is empty, too long, or has other characters |
| `bad-value` | a checked value is not one of those allowed |
| `unknown-kind` | no such card type |
| `unknown-field` | the card type has no such field |
| `no-items` | the card type takes no items |
| `cell-count` | an item has no cells or more than 6 |
| `exists` | a card with that id already exists |
| `id-in-use` | the id belongs to something of another kind |
| `shelved` | the id belongs to a topic or card on the shelf |
| `no-such-topic`, `no-such-group`, `no-such-card`, `no-such-item` | what the op refers to is not there |
| `not-found` | `del` found nothing with that id |
| `not-empty` | the topic still has cards |
| `not-shelved` | the topic is not on the shelf |
| `limit` | a count limit was reached |
| `pinned` | the user pinned the card |
| `user-only` | only the user may do this |
| `not-allowed` | the renderer does not let this writer do this (section 11) |

How a verdict travels is up to the binding (section 10).

### Events

What the user does on a renderer is expressed as ops with author `user`. They are applied at once and reported to the writer.

| Gesture | Op |
|---|---|
| tick or untick a checklist item | `upd <card> <item> done\|todo \| <text>` |
| delete an item | `del <card> <item>` |
| pick an option of a decision card | `set <card> chosen <item>`; with `multi`, `set <card> chosen <item>,<item>,...` once, when the user confirms |
| send an input card | `upd <card> <item> <name> \| <hint> \| <value>` for each filled box, then `set <card> sent yes` |
| move or resize a card | `move <card> <col> <row>`, `size <card> <w>x<h>` (these pin it) |
| unpin a card | `unpin <card>` |
| bring a topic back from the shelf | `restore <topic>` |

An event stream has three kinds of entries, each one line:

```
user <op>        the user did this on the board
input <text>     the user typed or said this
agent <op>       another writer changed the board
```

A writer MUST NOT send a `user` op back: it is already on the board.

## 10. Bindings

A binding says how lines, verdicts and events travel. A renderer may offer any of these. All carry the same ops.

### 10.1 Model output

The text a model generates is the op stream. The renderer cuts it into lines as tokens arrive and applies each. Rejections and notes go into the model's next input, each as `<line> → <code> <message>`. This is the binding with the least in the way, for an app that calls a model itself.

The input a renderer builds for the model is its own business. It SHOULD contain the board (section 8), the events since the last turn, the verdicts that were not `applied`, and what the user said.

### 10.2 Log

A board saved as a file is its accepted ops, in order. The first line is the header `# kite-protocol <major>.<minor>` (a comment, so a reader that predates it skips it). Each other line is a letter, a tab and a payload:

```
# kite-protocol 0.2
T	2026-11-18
A	topic ws Team Workshop
A	card k2 decision ws 3x3 Which venue?
U	set k2 chosen o2
```

`A` is an agent op, `U` a user op, `T` a date (`YYYY-MM-DD`) that applies to the ops after it. Rejected ops are not written. Replaying the file onto an empty board rebuilds it; a reader skips lines that fail.

### 10.3 Line session

A program holds a connection to a renderer and exchanges lines. The transport is anything that carries lines in both directions; the reference renderer uses TCP on the loopback address.

Client to renderer:

| Line | Meaning |
|---|---|
| `# kite-protocol <major>.<minor>` | optional first line; a major the renderer cannot read ends the session |
| `auth <token>` | required first when the renderer was given a token |
| any op | applied with author `agent` |
| `hello` | ask what the renderer supports (section 6): the description comes back as `\| ` lines |
| `read [<topic>]` | ask for the board (section 8): all of it, or one topic with its cards |
| `watch` | start receiving `user` and `input` events |
| `watch all` | also receive `agent` events for ops written by others |
| `unwatch` | stop |

Renderer to client, one line per op line or command, in order:

| Line | Meaning |
|---|---|
| `ok` | applied, or the command was done |
| `ok clipped <what> <limit>` | applied with a note; several notes are joined with `; ` |
| `err <code> <message>` | rejected |
| `\| <line>` | one line of data, sent before the `ok` that answers `read` or `hello` |
| `event <entry>` | pushed at any time while watching (section 9) |

Blank lines and comments get no reply. A client that watches MUST expect `event` lines between its own replies. `auth`, `hello`, `read`, `watch` and `unwatch` are reserved words of this binding and will not become verbs.

Besides the op codes, a session may answer `auth-required`, `unsupported-version`, `line-too-long`, `bad-utf8`, `rate-limited`, `too-many-connections`, `http-refused` and `unavailable`.

### 10.4 MCP

A renderer is an MCP server and the agent is its client. This is the binding for agents that already speak MCP: nothing is built on the agent's side.

| Tool | Input | Result |
|---|---|---|
| `screen` | `ops`: string, ops separated by line breaks | `applied`, or the lines that were rejected or clipped, one per line as `<line> → <code> <message>` or `clipped <what> <limit>` |
| `board_read` | `topic`: string, optional | the board (section 8), or that topic |
| `events` | `wait`: seconds, optional; `after`: integer, optional | event entries, one per line, then `cursor <n>`; `(nothing yet)` when none |
| `guide` | none | the text of GUIDE.md, followed by the renderer's description (section 6) |

`events` returns `user` and `input` entries numbered above `after` and waits up to `wait` seconds when there are none. Without `after` the renderer continues from the caller's last call. The server's `instructions` SHOULD tell a model that the board is the answer and to read the guide first.

A typical agent loop: `guide` once; `board_read`; `screen` with the answer; `events` to wait for the user; repeat.

### 10.5 AG-UI

A renderer is an [AG-UI](https://docs.ag-ui.com) client and the agent is an AG-UI server. This is the binding for agents built on a framework that speaks AG-UI.

For each run the renderer POSTs a `RunAgentInput`:

- `messages` ends with a user message whose text is the turn: the board inside `<board>…</board>`, the events since the last run inside `<events>…</events>` (one entry per line), the verdicts that were not `applied` inside `<rejected>…</rejected>`, then `<input>…</input>` with what the user said (empty when the run was started by a gesture).
- `state.kite` is the same as data: `{ "version": "0.3", "board": "<ops>", "events": ["user set k2 chosen o2", ...], "renderer": ["kinds status metric ...", "features tell"] }`. `renderer` is the description of section 6, one line per entry.
- `context` has one entry whose `value` is the text of GUIDE.md.
- `tools` has one frontend tool, `screen`, with the input of section 10.4.

The renderer applies ops from any of these, in the order they arrive:

| Event | What the renderer does |
|---|---|
| `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_CHUNK` | the text is an op stream (section 10.1) |
| `TOOL_CALL_START` / `_ARGS` / `_END` for `screen` | applies `ops`; the verdict goes back as a `tool` message in a following run |
| `CUSTOM` with `name` `kite.ops` | `value` is a string of ops, or an array of op strings |
| `STATE_SNAPSHOT`, `STATE_DELTA` | kept and sent back as `state` in the next run (the `kite` key is the renderer's) |
| `RUN_ERROR` | shown to the user |

An agent that knows nothing of KITE still works when its model follows the guide in `context` and answers in ops. A renderer MAY show text that contains no op in a way of its own.

## 11. Security

- A writer is not trusted. Every line passes the same checks, whoever sent it; a rejected line changes nothing.
- `web`, `image` and `doc` cards make the renderer load or offer to open an address or a local path chosen by the writer. A renderer that takes ops from outside its own process SHOULD NOT let those writers create them unless the user turned that on. It rejects them with `not-allowed` and leaves them out of the `kinds` it describes to that writer.
- A binding reachable by other programs MUST listen on the loopback address only, SHOULD require a token, and MUST refuse what a web page can send to a local port: an HTTP request on a line session, and a request carrying an `Origin` header on an HTTP binding.
- Ops carry no code. A renderer MUST NOT execute anything found in a title, a field or a cell.
- What the user typed and picked travels to the writer. A renderer SHOULD make it visible when an outside agent is connected.

## 12. Versioning

The version is `<major>.<minor>`.

- The **minor** number grows with additions: a new session command, a new binding, a new error code, a new field, and, from 0.3 on, a new core card type. A writer learns which types a renderer has from its description (section 6), so a new type breaks nobody who reads it.
- The **major** number grows with a breaking change: a new verb, a changed limit, a changed serialization order, a changed meaning. A reader MUST NOT read a stream that declares another major.
- While the major number is 0, a file written by a newer minor may hold lines an older reader rejects (a card of a type it lacks). It skips them and reads the rest.

A stream or file without a header is 0.1.

Changes are listed in [CHANGELOG.md](CHANGELOG.md). Open for a later version: a card that embeds another format's interface (an A2UI surface, an MCP App); declaring the fields and the look of an extension kind in the protocol itself; a batch of ops that applies as a whole or not at all.

## 13. Conformance

A **writer** conforms if every line it sends parses under sections 3 and 5, stays within section 4, and creates before it refers: a topic before its cards, a card before its items, a group before `put`.

A **renderer** conforms if it applies lines in order; rejects exactly what sections 5 and 6 say, with those codes; clips at the limits of sections 4 and 6; drops a failing line and continues; serializes as section 8; and treats `#` lines as comments.

[conformance/](conformance) holds cases any renderer can run: each is a list of lines with the verdict expected for each line and the serialized board expected at the end. The reference implementation runs them in its tests.

## 14. Next to A2UI, AG-UI and json-render

These solve neighbouring problems, and KITE is meant to work with them rather than replace them. This is the short form; [COMPARISON.md](COMPARISON.md) covers more projects, what KITE does not do, and the sources. Facts below are from their public repositories and specifications as of 2026-11-18.

| | KITE Protocol | A2UI (v1.0) | json-render | AG-UI (1.0) |
|---|---|---|---|---|
| What it is | An edit language for one persistent board | A declarative UI description with renderers | A library that renders model-written JSON with your components | An event protocol between an agent and an app |
| What a model writes | One op per line | JSON messages: `createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface` | A JSON tree of elements (`root`, `elements`) | Nothing itself; it carries the others |
| Vocabulary | 16 card types with a meaning each, and extension kinds | A catalog the app chooses; the basic one has 18 layout and input components | A catalog the app defines | Not its concern |
| Unit of change | A field or an item of a card | A component, a data path, a surface | A spec, streamed as patches | Events |
| State over time | The board persists and is read back every turn | Per surface | Per generated spec | Shared state (`STATE_SNAPSHOT`, `STATE_DELTA`) |
| Asking the user | `decision` and `input` cards; the answer returns as an op | `action` messages | Actions the catalog declares | Frontend tools, interrupts |
| Layout | The renderer's | The writer's (rows, columns) | The writer's | Not its concern |

- **AG-UI** is a transport. KITE rides on it (section 10.5): an AG-UI agent can drive a KITE board without knowing more than the guide.
- **A2UI** and **json-render** describe an interface component by component. KITE describes a workspace card by card and leaves layout to the renderer. A KITE card type could be offered as a custom component in an A2UI or json-render catalog; that mapping is not specified here.
- **MCP** is how an agent reaches tools. KITE offers a board as tools (section 10.4).
