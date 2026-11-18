# KITE Board Protocol v0.1

The line language KITE uses to edit its board, and to show the board back to the model. This document describes what KITE 0.3.0 does today, read from the source (commit `69c0d06`), plus two additions made after it: the version header (section 10) and the live input socket (section 11). Those two are marked **new**. Where the source does not say, it says "unknown". Line numbers (`src/lang.rs:28`) point at that commit and will drift; `src/feed.rs` and the header code in `src/lang.rs` are newer.

Machine-readable form: [protocol.schema.json](protocol.schema.json). Files you can load: [../examples](../examples).

## 1. Purpose

A KITE board is a tree: groups hold topics, topics hold cards, cards hold items. A model, a person or a program changes it with one-line ops. The board is the answer; there is no chat transcript.

```
group  ->  topic  ->  card  ->  item
(<= 8)                (14 types)  (<= 24 per card)
```

Two properties the rest follows from:

- Every change, whoever makes it, is one `Op` passed through one function that checks it (`src/core.rs:279`, `src/main.rs:784`).
- The board can be written back as ops. Replaying those ops on an empty board gives the same board (`src/lang.rs:113-114`, test `roundtrip` at `src/lang.rs:237`).

## 2. Transport

**Streamed text lines.** UTF-8, one op per line, a line ends at `\n`.

- An op is applied the moment its line ends, before the next line arrives (`src/lang.rs:1-2`, `src/main.rs:1733-1736`). A card can therefore appear and fill in while the model is still writing.
- `\r` and surrounding spaces are trimmed (`src/lang.rs:184`, `src/lang.rs:29`).
- Blank lines, lines starting with `#`, and lines starting with three backticks are ignored (`src/lang.rs:30`). `#` is the comment mark.
- A last line without `\n` is applied when the turn ends (`src/lang.rs:191-194`, `src/main.rs:1433-1435`).
- Text of `say` and `set <id> text` can be shown while still being typed (`src/lang.rs:199-214`).
- There is no escaping. A value runs to the end of the line, so it cannot contain a line break. Cells are split on `|`, so a cell cannot contain `|` (`src/lang.rs:23-25`). The app's own input form replaces both with a space (`src/ui.rs:1768`).
- Tokens are separated by any whitespace; the first word is the verb (`src/lang.rs:6-12`).

The same ops reach the board by four routes today:

| Route | What it is | Source |
|---|---|---|
| Model text stream | Engine output, line by line | `src/main.rs:1724-1750` |
| `screen` tool | Mid-turn board edit by the model; the `ops` string holds newline-separated lines; the reply is the verdict (section 8) | `src/tools.rs:38-41`, `src/main.rs:1709-1723` |
| User gestures | Clicks, ticks, drags, form sends become ops with author `user` | `src/ui.rs:1144-1152, 1774-1778, 2323, 2545` |
| Live input socket (**new**, off by default) | Another program on the same computer sends lines over TCP (section 11.1) | `src/feed.rs`, `src/main.rs` (`Msg::Feed`) |

## 3. Names and limits

| Thing | Rule | Source |
|---|---|---|
| id (topic, group, card, item, variable) | 1 to 24 chars; Unicode letters or digits, `_`, `-` | `src/core.rs:266-268` |
| topic name | clipped to 24; empty means the id | `src/core.rs:288` |
| group name | clipped to 16; empty means the id; at most 8 groups | `src/core.rs:301, 305` |
| card title | clipped to 40 | `src/core.rs:344, 351` |
| field value | clipped to the limit of that card type (section 5) | `src/core.rs:378-381` |
| item cell | clipped to 60 | `src/core.rs:148, 540-543` |
| cells per item | 1 to 6 | `src/core.rs:147, 520-522` |
| items per card | 24 (80 for `draw`) | `src/core.rs:146, 549-552` |
| card size | 1 to 8 columns and rows; out of range is clamped | `src/core.rs:149-150, 354-355` |
| `say` | clipped to 80 | `src/core.rs:502-505` |
| named values (`let`) | 64 names; value clipped to 60 | `src/core.rs:469-475` |

Clipping is not an error: the text is cut with `…` and a note is queued for the model (section 8). Ids share no registry except where stated: only `group` checks that its id is not already a topic or card id (`src/core.rs:298`). Keep ids unique across all kinds.

## 4. Ops

19 verbs. 18 change the board; `tell` does not. Syntax is exact: `<x>` required, `[x]` optional. "Author" is who may issue it.

| Verb | Syntax | Effect | Errors | Author | Source |
|---|---|---|---|---|---|
| `topic` | `topic <id> <name>` | Create topic, or rename if it exists | bad id; id is a shelved topic | any | `lang.rs:35`, `core.rs:281` |
| `group` | `group <id> <name>` | Create group, or rename | bad id; id used by a topic or card; more than 8 | any | `lang.rs:39`, `core.rs:294` |
| `mv` | `mv <card> <topic>` | Move card to another topic; clears its position and pin | no such topic or card | any | `lang.rs:43`, `core.rs:312` |
| `put` | `put <topic> <group>` | Place topic in group | no such group or topic | any | `lang.rs:47`, `core.rs:322` |
| `card` | `card <id> <kind> <topic> [<w>x<h>] <title>` | Create card | id exists, bad, or used by a shelved card; unknown kind; no such topic | any | `lang.rs:51`, `core.rs:329` |
| `set` | `set <id> <field> <value>` | Set one field; `field` may be `title` | no card; card type has no such field; value fails the check for that field | any | `lang.rs:64`, `core.rs:362` |
| `add` | `add <id> <item> <cell> \| <cell> ...` | Add item; an existing item id is replaced | type takes no items; bad item id; cell count; first-cell check; item limit | any | `lang.rs:69`, `core.rs:391, 511` |
| `upd` | `upd <id> <item> <cell> \| <cell> ...` | Replace an existing item | same as `add`, and item missing | any | `lang.rs:69`, `core.rs:392, 546` |
| `del` | `del <id> [<item>]` | With item: remove it. Without: remove the card, else the empty topic, else the group | nothing has that id; topic still has cards | any | `lang.rs:80`, `core.rs:393-425` |
| `size` | `size <id> <w>x<h>` | Resize | no card; pinned and author is `ai`; text not `NxM` | any | `lang.rs:84`, `core.rs:426` |
| `move` | `move <id> <col> <row>` | Place at a grid cell; negatives become 0 | no card; pinned and author is `ai`; not two integers | any | `lang.rs:89`, `core.rs:438` |
| `let` | `let <name> <value>` | Set a named value; empty value removes it | bad name; over 64 names | any | `lang.rs:97`, `core.rs:462` |
| `archive` | `archive <topic>` | Shelve the topic and its cards | no such topic | any | `lang.rs:101`, `core.rs:478` |
| `restore` | `restore <topic>` | Bring a shelved topic back | not on the shelf | any | `lang.rs:102`, `core.rs:488` |
| `pin` | `pin <id>` | Lock position and size | author is `ai` | user | `lang.rs:103`, `core.rs:448` |
| `unpin` | `unpin <id>` | Unlock; clears position | author is `ai` | user | `lang.rs:103`, `core.rs:448` |
| `focus` | `focus <id>` | Mark the card to look at | no such card | any | `lang.rs:104`, `core.rs:458` |
| `say` | `say <text>` | One-line caption under the board | none | any | `lang.rs:105`, `core.rs:501` |
| `tell` | `tell <text>` | Sentence to read aloud; no board effect | none | model | `lang.rs:106-107` |

Details that are easy to miss:

- `card` fails on an existing id. The model is told to fix a card with `set`/`add`/`upd`, not recreate it (`src/core.rs:337`). `add` on an existing item id overwrites (`src/core.rs:545`). `topic` and `group` on an existing id rename.
- `size` text is `<w>x<h>` with `x` or `X` and two integers (`src/lang.rs:18-21`). In `card`, a size is read from the token after the topic if it parses as one; otherwise that token starts the title (`src/lang.rs:57-61`).
- `del <id>` looks the id up as card first, then topic, then group (`src/core.rs:402-421`).
- Pinned cards: once a user moves or resizes a card it is pinned and `ai` ops that move or resize it are rejected. Content ops still work (`src/core.rs:428-447`).
- `focus` and `say` are not part of the serialized board (section 7).
- Archived ids stay reserved: a shelved topic id or card id cannot be reused until restored (`src/core.rs:285, 330`).
- `{name}` in a card title, field or cell shows the value set by `let`. It is substituted at draw time, not stored (`src/ui.rs:1751-1763`).

## 5. Card types

14 types, registered in one table, `PARTS` (`src/core.rs:46-103`). Every card also takes `title` (40). Default size is columns x rows. "Checked" means the app rejects a wrong value; otherwise it only clips.

| Type | Default | Fields (max length) | Item cells | Checked |
|---|---|---|---|---|
| `status` | 2x1 | `state` (8), `text` (80) | none | `state` is `ok` `run` `wait` `fail` `idle` (`core.rs:370`) |
| `metric` | 2x2 | `value` (14), `unit` (8), `delta` (14; a leading `+` or `-` colors it), `text` (60) | none | |
| `chart` | 4x3 | `unit` (8), `form` (8: `bar` default, `line`, `donut`) | `name \| number` | cell 2 parses as a number, commas allowed (`core.rs:537`); `form` value is not checked |
| `route` | 6x5 | `total` (40), `text` (80) | `name \| lat,lon \| distance and time to next stop` | cell 2 is two numbers split by a comma (`core.rs:531`) |
| `draw` | 5x4 | `text` (80) | `shape \| coordinates \| text \| color \| size` | cell 1 is `line` `arrow` `rect` `circle` `text` (`core.rs:534`) |
| `image` | 4x3 | `src` (600; absolute path or URL), `text` (80) | none | |
| `table` | 4x3 | `cols` (200; names split by `\|`) | up to 6 cells | |
| `progress` | 3x3 | `pct` (3), `text` (60) | `done\|run\|todo\|fail \| step` | `pct` integer 0 to 100 (`core.rs:373`); cell 1 (`core.rs:523-530`) |
| `checklist` | 3x3 | none | `done\|todo \| text` | cell 1 |
| `decision` | 3x3 | `text` (120), `chosen` (24, set by the user) | `option \| one-line description` | |
| `input` | 3x3 | `text` (120), `sent` (8, set by the user) | `field name \| hint or kind` | |
| `timeline` | 3x3 | none | `when \| text \| done\|run\|todo (optional)` | |
| `note` | 3x2 | `text` (240) | none | |
| `web` | 6x5 | `url` (600; URL or absolute file path) | none | |

Per-kind sources: `status` `core.rs:47`, `metric` `48-55`, `chart` `56-63`, `route` `64-71`, `draw` `72-79`, `image` `80`, `table` `81`, `progress` `82`, `checklist` `83`, `decision` `84-91`, `input` `92-99`, `timeline` `100`, `note` `101`, `web` `102`.

Notes per type:

- `draw` coordinates: the card interior is 0 to 100 in both directions, origin top left. `rect` is `x,y w,h`; `circle` is `x,y r`; `line` and `arrow` list points `x,y x,y ...`; `text` is `x,y`. Colors: empty, `accent`, `green`, `red`, `amber`, `dim`, `faint`, `white`. Text size: `s`, empty, `l`. This comes from the model prompt (`src/prompt.md:38-49`), not from the checker, which only tests the shape name.
- `input` cell 2 is a hint, or a kind: `date`, `number`, or `slider <lo>~<hi> <unit>` (`src/ui.rs:1723-1747`). Anything else is a free text box with that hint.
- `route` draws straight lines between stops. A road-following shape is drawn only if one was saved for that card by the app's own `route_find` tool (`src/ui.rs:1947-1953`, `src/route.rs:241-249`); the distances and times in cell 3 are plain text you supply.
- `web` and `image` read local paths and URLs on the user's machine. A driver that feeds untrusted ops should treat both as capabilities (unknown: the app does no filtering; none seen in `src/core.rs`).

Asking cards: `decision` and `input` are the types that wait for the user (`Kind::asks`, `src/core.rs:130-132`). The app shows them one at a time in the "my turn" slot, oldest first, preferring one from the topic just answered (`src/main.rs:1056-1079`).

## 6. Layout hints

Placement is automatic. `size` and `move` are hints and the user's gestures win: a user move or resize pins the card (`src/core.rs:433-446`). When a topic has more cards than fit at a readable size, the cards kept in view are chosen in this order: the focused card, asking cards, pinned or placed cards, higher importance, earlier-created. The rest fold under "+N more" (`src/ui.rs:500-508`; importance comes from the Jev decision model when a Jev key is set and is 0.5 otherwise, `src/decide.rs:176`, `src/ui.rs:505`). An emitter should normally send neither `move` nor `size` after creation, and should create the most important card first.

## 7. State round trip

After every turn the board is written back in the same language, and that text is what the model sees next. Serialization (`src/lang.rs:114-163`), in this order:

1. `let <name> <value>` for each named value.
2. `group <id> <name>` for each group.
3. For each topic: `topic <id> <name>`, then `put <topic> <group>` if it has one.
4. For each card: `card <id> <kind> <topic> <w>x<h> <title>`, then `set` lines (field names in alphabetical order), then `add` lines (insertion order), then `move` if placed, then `pin` if pinned.

Not written: `focus`, `say`, the shelf, the saved shape of a route. Shelved topics are summarised separately for the model (`src/main.rs:1159-1178`) and come back through `restore`.

When the text is longer than 12,000 characters (`src/main.rs:47, 1119-1120`) topics far from the current talk are shortened: the six most recently touched topics in full, the next 14 as card titles only, the rest as a name and a card count (`src/main.rs:1123-1128`), each with a `#` note line (`src/lang.rs:135-136`) and the wrapper `<board detail="일부만">` (`src/main.rs:1145`). A reader of the board must therefore treat a `#` line as a note, never as data.

What the user did is sent back the same way. Gestures are ops with author `user`; they are applied at once and also queued as `<events>` for the next turn (`src/main.rs:831, 1201-1203`):

| Gesture | Op written | Source |
|---|---|---|
| tick or untick a checklist item | `upd <card> <item> done\|todo \| <text>` | `ui.rs:2323` |
| delete an item | `del <card> <item>` | `ui.rs:2342` |
| pick a decision option | `set <card> chosen <item>` | `ui.rs:2545` |
| send an input form | `upd <card> <item> <name> \| <hint> \| <value>` per filled field, then `set <card> sent yes` | `ui.rs:1767-1779` |
| drag or resize | `move <card> <col> <row>`, `size <card> <w>x<h>` (pins) | `ui.rs:1144-1146` |
| unpin | `unpin <card>` | `ui.rs:1152` |
| restore from the shelf | `restore <topic>` | `chat.rs:290` |

A tick or an input send makes the app start a turn by itself after 900 ms (ticks, so that several ticks batch) or 250 ms (`chosen`, `sent`), with an empty `<input>` (`src/main.rs:834-847`).

The model's turn envelope (informative, internal to KITE): `<board>`, then optional `<core>`, `<archived>`, `<recent>`, `<jobs>`, `<job_done>`, `<events>`, `<tidy>`, `<review>`, `<rejected>`, `<selected>`, `<voice>`, `<lang>`, `<memory>`, `<env>`, ending with `<input>`user text`</input>` (`src/main.rs:1148-1246`). Only `<board>`, `<events>`, `<rejected>` and `<input>` matter to a driver.

### Persistence

The app keeps an append-only log, `data/ops.log`, next to the program. One line per accepted op: `A<TAB><op line>` for model ops, `U<TAB><op line>` for user ops, and `T<TAB><date>` marking a new day. Rejected ops are not written (`src/main.rs:790-800`). On start the log is replayed in order onto an empty board, and ops that fail on replay are skipped (`src/main.rs:741-761`). **New:** a log KITE creates starts with the line `# kite-protocol 0.1` (section 10). It has no tab, so it is a comment to the replay; logs without it are read as 0.1. So the board is event-sourced and the log is a complete, human-readable copy of it.

## 8. Errors

- **Per line, never per turn.** A line that fails to parse or to apply is dropped and the next line still runs (`src/main.rs:850-853`, test `rejects` at `src/lang.rs:253`). The turn continues.
- **Parse errors** (`src/lang.rs`): unknown verb (`모르는 명령 '<verb>'`, `108`), missing required argument (`<what> 누락`, `14-16`), malformed `size` or `move` (`86`, `94`). A line that is not an op, such as prose, is therefore rejected as an unknown verb.
- **Apply errors** (`src/core.rs`): see the Errors column in section 4.
- **Clipping notes.** Text over a limit is cut and a note is queued, for example `<id>.<field> <n>자 초과로 잘림` (`src/core.rs:379, 345, 473, 503, 541`).
- **Feedback to the model.** Rejected lines and clipping notes go into `<rejected>` on the next turn, as `<line> → <reason>` (`src/main.rs:850-853, 1219-1223`). During a turn that uses tools, the `screen` tool answers immediately: `반영됨` if everything applied, else `일부 거부되거나 잘림:` and the reasons (`src/main.rs:1722`).
- **User-side failures are silent** (`src/main.rs:854`).
- **Message text is Korean and free-form.** The reasons above are written for a Korean-speaking model and are not stable codes. Match on the verb and your own checks, not on the text. (A stable error code is an open item, section 10.)
- **Atomicity.** None across lines. Within one op, the checks in `Board::apply` run before the change as far as read (not tested exhaustively).

## 9. Worked examples

Each block was run through KITE's own `lang.rs` and `core.rs` (compiled alone, without the app) and applied without error. The follow-up model replies are illustrations of what a model would send, and were applied the same way.

### 9.1 To-do list

Request: "make me a moving checklist". Model output ([examples/todo.ops](../examples/todo.ops)):

```
say Moving checklist ready. Two items are done.
topic move Moving Day
card k1 checklist move 3x3 Before the truck comes
add k1 i1 done | Book the movers
add k1 i2 done | Cancel the internet
add k1 i3 todo | Pack the kitchen
add k1 i4 todo | Return the keys
card k2 progress move 3x3 Packing
set k2 pct 40
set k2 text 2 of 5 rooms boxed
add k2 s1 done | Bedroom
add k2 s2 done | Study
add k2 s3 run | Kitchen
add k2 s4 todo | Bathroom
add k2 s5 todo | Living room
card k3 metric move 2x2 Days left
set k3 value 9
set k3 unit days
```

Written back next turn (`say` is gone; `set` lines are alphabetical, so `unit` precedes `value`):

```
topic move Moving Day
card k1 checklist move 3x3 Before the truck comes
add k1 i1 done | Book the movers
...
card k3 metric move 2x2 Days left
set k3 unit days
set k3 value 9
```

The user ticks "Pack the kitchen". The app applies and sends this event:

```
upd k1 i3 done | Pack the kitchen
```

The model updates the same cards instead of adding new ones:

```
say Kitchen packed.
set k2 pct 60
upd k2 s3 done | Kitchen
upd k2 s4 run | Bathroom
```

### 9.2 Route card

Request: "show a walk from the station to the palace" ([examples/route.ops](../examples/route.ops)):

```
say Drew a walk through central Seoul.
topic walk Seoul Walk
card r1 route walk 6x5 Station to the palace
set r1 total 3.3 km, about 45 min on foot
add r1 a Seoul Station | 37.5547,126.9707 | 2.8 km, 38 min
add r1 b Gwanghwamun | 37.5759,126.9769 | 0.5 km, 7 min
add r1 c Gyeongbokgung | 37.5796,126.9770
card r2 timeline walk 3x3 Day plan
add r2 a 09:00 | Leave the station | todo
add r2 b 10:00 | Gwanghwamun Square | todo
add r2 c 10:30 | Palace tour | todo
```

Cell 2 must be `lat,lon`; a stop without it is rejected (`src/core.rs:531`). The last stop has no cell 3 because there is no next stop. At least two stops are needed to draw a path (`src/ui.rs:1943`). The figures here are hand-written; in the app, distances and times come from Kakao Map through the `route_find` tool, which works in South Korea (README). Without a saved shape the stops are joined by straight lines.

### 9.3 "My turn" decision card

Request: "pick a workshop venue" ([examples/my-turn.ops](../examples/my-turn.ops)). Model output:

```
say Two venues compared. Pick one.
topic ws Team Workshop
card k1 table ws 5x2 Venue comparison
set k1 cols Venue | Travel | Cost per person
add k1 r1 Gangneung | 2h 40m | 180,000 KRW
add k1 r2 Gapyeong | 1h 10m | 120,000 KRW
card k2 decision ws 3x3 Which venue?
set k2 text Where should the workshop be?
add k2 o1 Gangneung | Far, but better facilities
add k2 o2 Gapyeong | Close and cheaper
card k3 input ws 3x3 Dates and headcount
set k3 text Needed to book the venue
add k3 a Start date | date
add k3 b People | number
add k3 c Budget per person | slider 5~30 10k KRW
focus k2
```

`decision` and `input` are the asking types, so the app moves one of them to the "my turn" slot beside the conversation and shows the rest of its topic next to it. The user picks Gapyeong. The app writes `set k2 chosen o2` as a user op and 250 ms later starts a turn with:

```
<events>
set k2 chosen o2
</events>
<input></input>
```

An empty `<input>` means the user only touched the screen. The model records the choice and removes the answered card:

```
say Gapyeong it is.
del k2
card s1 status ws 3x1 Venue
set s1 state ok
set s1 text Gapyeong chosen
```

The input card works the same way. Sending the form produces one `upd` per filled field and then the sent mark:

```
upd k3 a Start date | date | 12/3
upd k3 b People | number | 14
set k3 sent yes
```

The last cell of each `upd` is the user's value.

## 10. Versioning

- KITE 0.3.0 (`Cargo.toml:3`) is the only implementation and the protocol is whatever it accepts. **New:** a version marker, below. Streams and files from before it have none and count as 0.1.
- This document is v0.1 of the description. Treat these changes as breaking: a new verb (an old parser rejects it as unknown, `src/lang.rs:108`), a new card type (`Kind::parse` fails, `src/core.rs:339`), a changed limit, a changed serialization order.
- **Version header (new).** The first line of a saved file or a stream is `# kite-protocol 0.1`. It is an ordinary comment, so a parser that predates it ignores it (`src/lang.rs:30`) and `lang::parse` still returns no op for it. Writing: KITE writes it as the first line of a new `data/ops.log`; the files in [../examples](../examples) and `tools/promo` seeds carry it. Reading: a line `# kite-protocol <major>.<minor>` is a declaration (`lang::declared_version`, `lang::can_read`). Same major: read. Different major: the live socket answers `err` and closes the connection; the log replay writes a note to `data/feed.log` and still replays, because dropping a board is worse than skipping lines that fail. The header is not added to the board text sent to the model (section 7), and an emitter that writes a log must write it on the first line only. The minor number is for additions an old reader can skip; the major number changes on a breaking change (list above).
- Open items for v0.2: stable error codes in place of Korean sentences; a name for the author field in the log beyond `A` and `U`; a way to carry values with a line break or `|`.

## 11. Driving a KITE board from another app or agent

What exists today, and what does not.

**You can do now**

1. **Write the log.** With KITE closed, append `A<TAB><op>` lines to `data/ops.log` (create it if absent). On next start the board is rebuilt from it. In real mode the model then sees and edits that board like any other. Back up the old log first; the app appends to it.
2. **Seed the demo.** With no API key, or with `LYBOARD_DEMO=1`, set `LYBOARD_DEMO_SEED=<file.ops>`. The file uses the log format (`A<TAB>...`, `T<TAB>` lines are skipped) and is applied before the window opens (`src/main.rs:644-657`).
3. **Script model turns.** In the same mode, `LYBOARD_DEMO_FILE=<file>` holds scenes separated by a line containing only `===`. Each user turn plays the next scene, streamed like real model output (`src/llm.rs:318-343`). Plain op lines, no tab prefix. See [examples/scenes-todo.txt](../examples/scenes-todo.txt).
4. **Be the engine through Claude Code.** In the Claude Code engine, KITE appends the language to the system prompt and takes the text output as the screen (`src/cc.rs:21-30`). Your Claude Code setup (CLAUDE.md, skills, MCP servers, hooks) applies. The engine file `engine.txt` or `LYBOARD_ENGINE=claude-code` selects it (`src/llm.rs:71-72`).
5. **Re-implement the protocol.** The parser is about 85 lines and the checker about 280 (`src/lang.rs:28-111`, `src/core.rs:279-559`). `docs/protocol.schema.json` validates a JSON form; the tests at `src/lang.rs:216-300` and `src/core.rs:562-614` are usable as test vectors.

**New: live input** (section 11.1) lets another program drive a running board. Everything above still works.

**Not available**

- No stdin reader, named pipe, unix socket or file watcher. The live socket (11.1) is the one channel. The local MCP server for Claude Code (`127.0.0.1`, random port, per-run token, `src/cc.rs:387-408`) is separate and takes no `screen` edits.
- No pluggable engine: the engine is the Anthropic API, Claude Code, or the demo script (`src/llm.rs:62-83`).
- No headless mode and no non-egui renderer.

### 11.1 Live input socket (new)

Off by default. Set `KITE_PROTOCOL_PORT` to a number from 1024 to 65535 before starting KITE and it listens on `127.0.0.1` (not on any other address) for protocol lines. Windows, macOS and Linux behave the same: it is plain TCP from the standard library, no platform code.

| Setting | Meaning |
|---|---|
| `KITE_PROTOCOL_PORT=<port>` | Turn it on. Anything else (unset, not a number, below 1024) leaves it off; a bad value is written to `data/feed.log`. If the port is taken, KITE starts without it and says so in `data/feed.log`. |
| `KITE_PROTOCOL_TOKEN=<secret>` | Optional. When set, a connection must send `auth <secret>` as its first line, or it is answered `err auth required` and closed. Any program on the computer can reach a local port, so set it if other users or untrusted programs share the machine. |

How it behaves:

- One op per line, UTF-8, ended by `\n`, exactly as in section 2. Blank lines and `#` lines are ignored and get no reply.
- Every other line is answered with one line, in order: `ok`; `ok <note>` when text was clipped (section 8); or `err <line> → <reason>` when the line was rejected. The reason text is the same Korean sentence a model would get (section 8), so match on `ok` / `err`, not on the words.
- Each line goes through the same function as a model line (`apply_line`, `src/main.rs:784`) with author `ai`. So it follows the same checks and limits (sections 3 to 5), pinned cards refuse `size` and `move`, and `pin` and `unpin` are refused. The change appears on screen at once, is appended to `data/ops.log` as `A<TAB><op>`, and is part of the board text the model reads on its next turn. A rejected external line is answered to the sender; it is not put in the model's `<rejected>`.
- Limits (`src/feed.rs`): a line over 4096 bytes is rejected and the rest of it is dropped; invalid UTF-8 is rejected; 50 lines per second per connection with a burst of 100, over that `err` and the line is not applied; 4 connections at once; a connection with no traffic for 10 minutes is closed. A first line `# kite-protocol <major>.<minor>` with an unknown major gets `err` and the connection is closed. A line shaped like an HTTP request line (`POST / HTTP/1.1`) also gets `err` and closes the connection, so a web page open in a browser cannot write to the board by sending a request to this port.
- Every connection, line and verdict is logged to `data/feed.log` with the date and time and the peer address. A logging failure does not stop the feed.
- It works in the demo too, but the demo keeps no `ops.log`, so the lines are not saved.
- `web` and `image` cards read local paths and URLs (section 5). Whoever can connect can create them. That is why the port is off by default and has an optional token.

Five lines of Python that build a card on the running board:

```python
import socket
s = socket.create_connection(("127.0.0.1", 7878))   # KITE_PROTOCOL_PORT=7878
f = s.makefile("rw", encoding="utf-8", newline="\n")
for line in ["topic demo Demo", "card k1 metric demo 2x2 Users", "set k1 value 42"]:
    f.write(line + "\n"); f.flush(); print(f.readline().strip())   # ok, ok, ok
```

From a shell: `printf 'topic demo Demo\nsay hello\n' | nc 127.0.0.1 7878`. Test vectors for the feeder are in `src/feed.rs` (`mod tests`).

Not built, and why: a named pipe or a watched inbox file. The socket covers the same need on every platform with less code. Using the socket with a Claude Code or other agent as the writer is the intended case; the agent should read the board first (section 7 text, or `board_read` through the MCP server) and send only the lines that change it.

## 12. Where this sits next to A2UI and AG-UI

Both are described here from their own README files (fetched 2026-11-16 from `google/A2UI` and `ag-ui-protocol/ag-ui`, `main` branch). Nothing below comes from their specification pages, which were not read. "Unknown" marks what the READMEs do not say.

| | A2UI | AG-UI | KITE Board Protocol |
|---|---|---|---|
| Their own words | "an open-source generative UI framework, complete with a protocol optimized for streaming dynamic user interfaces", with renderers and agent SDKs | "an open, lightweight, event-based protocol that standardizes how AI agents connect to user-facing applications" | none; this document is a first description |
| Layer | UI description plus its transport and renderers: inference format, transport messages, renderer with a widget catalog | Agent-to-app event stream; the README places it beside MCP (tools) and A2A (agent to agent) | UI description only: the edit language a model writes and the board text it reads back |
| What it carries | UI "as data, not code", checked against a schema; a catalog of components the app allows | About 16 standard event types; bi-directional state sync, generative UI, human-in-the-loop are listed as features | Imperative ops on one board: create, set, add, update, delete, move, shelve |
| Wire format | Messages for a renderer; the README mentions JSON (A2UI JSON from a composer) | Transport-agnostic: "SSE, WebSockets, webhooks, etc." | Plain text lines; one op per line |
| Streaming | Yes ("progressive rendering") | Yes ("real-time agentic chat with streaming") | Yes; a line is applied the moment it ends |
| Component vocabulary | A catalog the app developer chooses; a basic catalog exists (details unknown) | Not its concern (unknown) | Fixed: 14 card types in `PARTS` |
| Renderers | Lit, Angular, React, Flutter, SwiftUI | Clients such as CopilotKit; renderers are not its concern | One: the egui desktop app |
| Who generates | Agent, "typically backed by a language or a decision model" | Agent backend emitting events | A language model and the user's gestures; other programs through the opt-in local socket (section 11.1) |
| Security stance | Stated: validate against a schema, no executable code | Unknown | None stated; `web` and `image` cards read paths and URLs (section 5) |
| Maturity | Protocol v1.0 spec linked, v1.1 being scoped | Several SDKs and integrations listed | v0.1 description of one implementation |

How they relate, as far as the READMEs support it:

- KITE ops and A2UI both answer "what does the model write to change the screen". A2UI sits across more layers and platforms. KITE is narrower: one board, one renderer, a closed set of card types, and the state is written back every turn so the model never has to remember it.
- AG-UI answers "how do events travel between the agent and the app". KITE has only a local line socket today, with no event types (section 11.1). Whether KITE ops could ride inside AG-UI events is untested here; the AG-UI README says it allows "loose event format matching" and any transport, which does not settle it.
- Unknown from the READMEs: whether A2UI messages are full-surface or incremental edits; the exact AG-UI event names; whether either has a line-based form.

## 13. Conformance in one paragraph

An emitter conforms if every line it writes parses with section 2 and section 4, stays within section 3, and creates before it refers: topic before card, card before item, group before `put`. A reader conforms if it applies lines in order, drops the failing line and continues, treats `#` lines as notes, and ignores nothing else silently.
