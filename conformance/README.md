# Conformance cases

Each `.txt` file here is one case a renderer can run to check that it follows [SPEC.md](../SPEC.md).

```
# a comment
agent: topic t Trip            an op line and who wrote it (agent or user)
  -> ok                        the verdict expected for that line
agent: card k1 gauge t X
  -> err unknown-kind          a rejection is matched on its code only
agent: set k1 text <300 x>     <N c> stands for the character c repeated N times
  -> ok clipped k1.text 240    a note is matched in full
board:                         everything after this line is the board expected at the end,
topic t Trip                   serialized as in SPEC.md section 8
```

To run a case: start from an empty board, apply each line with its author, compare each verdict, then compare the serialized board. A line the spec says is skipped (blank, comment, code fence, `tell`) has the verdict `skip`. The op is the text after `agent: ` or `user: ` as written, so a case can hold tabs and extra spaces.

The reference implementations run every file in this folder: Rust (`cd rust && cargo test`) and JavaScript (`node js/test.mjs`). Both also replay the board they wrote, with the `restore` author, and expect the same board again (SPEC.md section 8).

A rejected line in a case breaks one rule only, so the expected code does not depend on the order a renderer checks in.

## What is covered

The numbers are the case files (`03` is `03-rejections.txt`).

| File | Theme |
|---|---|
| 01-basics | a topic, three cards, the order of the board |
| 02-lines | skipped lines, spaces, sizes, missing arguments |
| 03-rejections | most codes, once |
| 04-limits | clipping and the group limit |
| 05-authors | the user's ops, pinning |
| 06-structure | groups, moving, deleting, the shelf, named values |
| 07-growing | record, extension kinds, doc, `multi`, `\|` |
| 08-answers | the user's answers |
| 09-user-only | everything only the user may write |
| 10-shelf | `archive` and `restore` |
| 11-groups | `group`, `put`, `mv`, the lookup order of `del` |
| 12-named-values | `let` |
| 13-clipping | every text limit |
| 14-counts | cells, items, record fields, groups |
| 15-counts-large | 80 shapes in a `draw`, 64 named values |
| 16-rejections-by-verb | the rejections of each verb that 03 does not reach |
| 17-pinned | pinned cards |
| 18-escapes | `\|`, `\n`, backslashes |
| 19-extension-kinds | `x-*` |
| 20-record-doc | `record` and `doc` |
| 21-input-boxes | the kinds of input box, sending |
| 22-decision | `multi`, `tone`, `chosen` |
| 23-kinds-plain | status, metric, image, note, web |
| 24-kinds-items | chart, route, draw, table, progress, checklist, timeline |
| 25-ids | what an id is |
| 26-lines | comments, tabs, sizes in `card` |
| 27-size-move-arguments | `size` and `move` with a size or a cell absent: `bad-syntax` |
| 28-set-empty-value | `set` without a value |
| 29-shelved-id-as-group | a group cannot take an id that is on the shelf |
| 30-extension-kind-length | 24 characters for the whole kind name |
| 31-replay-agent-placed | a board with a card an agent placed reads back the same |
| 32-numbers | what a number is in a chart and a route |
| 33-integers | the digits of a size and of a grid cell |
| 34-id-characters | ids above U+007F |
| 35-white-space | the White_Space characters, and two that are not |
| 36-name-order | code point order of names and fields |

### Verbs

| Verb | Applied in | Rejected in (code: files) |
|---|---|---|
| `topic` | every file | `bad-id`: 03 25 34; `shelved`: 06 10; `missing-argument`: 02 |
| `group` | 04 06 10 11 13 14 16 25 29 34 | `bad-id`: 16 25; `id-in-use`: 03 11 16 29; `shelved`: 29; `limit`: 04 14; `missing-argument`: 16 |
| `put` | 06 10 11 29 34 | `no-such-group`: 03 11 16; `no-such-topic`: 10 11 16; `missing-argument`: 16 |
| `card` | every file | `exists`: 03 16; `bad-id`: 16 25; `shelved`: 06 10; `unknown-kind`: 03 07 16 19 30 34; `no-such-topic`: 03 10 16; `missing-argument`: 02 16; `not-allowed`: none (below) |
| `set` | 01 04 to 10, 12 to 14, 17 to 26, 28 31 34 35 36 | `no-such-card`: 03 10 16; `unknown-field`: 03 07 09 16 19 to 24, 28 34; `bad-value`: 03 07 08 09 21 to 24, 28; `user-only`: 08 09 28; `limit` (13th field of a record): 14; `missing-argument`: 02 16 28 |
| `add` | 01 to 05, 07 to 10, 12 to 16, 18 to 22, 24 25 31 32 34 35 | `no-such-card`: 02 10 16 26; `no-items`: 03 07 20 23; `bad-id`: 03 16 25; `cell-count`: 03 14 19 20; `bad-value`: 03 16 24 32; `limit`: 14 15; `user-only`: 08 09; `missing-argument`: 02 16 |
| `upd` | 01 05 08 09 13 14 18 to 21, 24 31 | `no-such-item`: 03 13 16 19 20 21; `no-such-card`: 16; `no-items`: 16 20 23; `cell-count`: 14 16; `bad-value`: 16 24; `user-only`: 08 09; `missing-argument`: 16; `bad-id`: none (below) |
| `del` | 06 10 11 14 15 17 19 to 22, 24 | `no-such-item`: 03 16; `not-found`: 03 10 11 16; `not-empty`: 03 11 16; `missing-argument`: 02 |
| `mv` | 06 11 17 19 | `no-such-topic`: 03 10 11 16; `no-such-card`: 03 10 11 16; `missing-argument`: 16 |
| `size` | 05 17 19 27 31 33 | `no-such-card`: 16; `pinned`: 05 17; `bad-syntax`: 02 16 27 33 |
| `move` | 05 10 17 19 27 31 33 | `no-such-card`: 16; `pinned`: 05 10 17 31; `bad-syntax`: 02 05 16 17 27 33 |
| `pin` | 05 09 17 | `user-only`: 03 09; `no-such-card`: 09; `missing-argument`: 16 |
| `unpin` | 05 09 17 | `user-only`: 03 09; `no-such-card`: 09; `missing-argument`: 16 |
| `focus` | 01 19 | `no-such-card`: 03 10 16; `missing-argument`: 16 |
| `let` | 04 06 12 15 18 25 34 35 36 | `bad-id`: 03 12 25; `limit`: 15; `missing-argument`: 12 16 |
| `archive` | 06 10 29 | `no-such-topic`: 03 10 16; `missing-argument`: 16 |
| `restore` | 06 10 29 | `not-shelved`: 03 10 16; `missing-argument`: 16 |
| `say` | 01 04 13 18 26 | never rejected |
| `tell` | 02 26 (skipped) | never rejected |

The user's gestures of SPEC.md section 9: ticking (05 08 13 24), deleting an item (24), picking (05 07 08 09 22), sending an input card (05 08 09 21 31), moving and resizing (05 10 17 31), `unpin` (05 09 17), `restore` (10).

### Card types

| Type | Files |
|---|---|
| `status` | 23; also 03 13 26 28 |
| `metric` | 23; also 01 06 12 13 |
| `chart` | 24 32; also 03 13 |
| `route` | 24 32; also 03 13 |
| `draw` | 24 15; also 03 13 |
| `image` | 23; also 13 |
| `table` | 24 18; also 02 04 07 13 14 |
| `progress` | 24; also 01 03 13 |
| `checklist` | 24 14; also 01 03 05 08 10 12 13 16 18 25 |
| `decision` | 22 09; also 05 07 08 13 |
| `input` | 21 09; also 05 07 08 13 18 |
| `timeline` | 24; also 09 |
| `note` | 23; and most files |
| `web` | 23; also 13 |
| `record` | 20 14; also 07 09 13 28 34 36 |
| `doc` | 20; also 07 13 |
| extension kinds (`x-*`) | 19 30; also 07 09 13 14 34 |

### Codes

| Code | Files |
|---|---|
| `unknown-verb` | 02 16 26 35 |
| `missing-argument` | 02 12 16 28 |
| `bad-syntax` | 02 05 16 17 27 33 |
| `bad-id` | 03 12 16 25 34 |
| `bad-value` | 03 07 08 09 16 21 22 23 24 28 32 |
| `unknown-kind` | 03 07 16 19 30 34 |
| `unknown-field` | 03 07 09 16 19 20 21 22 23 24 28 34 |
| `no-items` | 03 07 16 20 23 |
| `cell-count` | 03 14 16 19 20 |
| `exists` | 03 16 |
| `id-in-use` | 03 11 16 29 |
| `shelved` | 06 10 29 |
| `no-such-topic` | 03 10 11 16 |
| `no-such-group` | 03 11 16 |
| `no-such-card` | 02 03 09 10 11 16 26 |
| `no-such-item` | 03 13 16 19 20 21 |
| `not-found` | 03 10 11 16 |
| `not-empty` | 03 11 16 |
| `not-shelved` | 03 10 16 |
| `limit` | 04 14 15 |
| `pinned` | 05 10 17 31 |
| `user-only` | 03 08 09 28 |
| `not-allowed` | none |
| note `clipped <what> <limit>` | 04 07 13 21; each form of `<what>` and each field with a limit in 13 |

### Not covered, and why

- **`not-allowed`.** A renderer answers it when its own settings forbid a type to a writer (SPEC.md section 11). A case has no way to say what a renderer was configured to forbid, and a renderer that forbids nothing never answers it.
- **`upd` with `bad-id`.** An item whose id is not valid cannot exist, so `no-such-item` holds for the same line and the code would depend on the order of the checks.
- **The codes of a session** (`auth-required`, `line-too-long` and the others of SPEC.md 10.3) and everything else about bindings: these cases apply ops to a board, they do not open a connection.
- **A trailing `\r`, a last line without `\n`, and the U+FEFF a file may start with** (SPEC.md sections 3 and 10.2). A case file is cut into lines before it is run, so none of them survives into an op. Both implementations test the U+FEFF rule on their line cutter.
- **The `restore` author** (SPEC.md section 8) writes no line of a case. It is exercised by every case all the same: the runners read each board back with it, and 31 is the case that fails if they read it back as the user.
- **`{name}` shown as a value, `\n` shown as a line break, `focus` and `say`.** They are drawing, or state that is not written back; the cases check that they are accepted and that the stored text is unchanged (12, 18).
- **What a renderer may shorten** for a model (SPEC.md section 8).

## Settled in 0.4

Cases 27 to 36 began as questions: lines the specification answered one way and the implementations another, or that Rust and JavaScript answered differently. Each was decided, written into SPEC.md and fixed where an implementation was wrong ([CHANGELOG.md](../CHANGELOG.md), "Settled in 0.4"). A new question goes the same way: write the case to the letter of the specification, and if an implementation disagrees, settle the specification first.

Two places where the specification is still silent, and where the cases follow what both implementations do:

- `del <card> <item>` on a card that is not there is `no-such-card` in both implementations. Section 5 does not list that code for `del`; no case tests it.
- Ids are compared as written, so `K1` and `k1` are two cards (25). The specification does not say so.
