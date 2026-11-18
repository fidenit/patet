# Examples

Boards in the PATET ([SPEC.md](../SPEC.md)). The reference implementation applies every `.ops` file here in its tests, without a rejection.

| File | Shows |
|---|---|
| [todo.ops](todo.ops) | A checklist, a progress card and a metric on one topic |
| [route.ops](route.ops) | A route card with three stops, and a timeline beside it |
| [my-turn.ops](my-turn.ops) | A decision card and an input form, which come to the "my turn" slot |
| [workspace.ops](workspace.ops) | Groups, several topics, a named value, a line chart, a drawing, a shelved topic |
| [scenes-todo.txt](scenes-todo.txt) | Three scripted model turns: create a list, tick items, ask a decision |
| [todo.json](todo.json) | `todo.ops` in the JSON form described by [protocol.schema.json](../schema/protocol.schema.json) |

The distances and times in `route.ops` are hand-written. In the app they come from Kakao Map.

## File format

`.ops` files are in the log format (SPEC.md 10.2). The first line is the version header `# patet 0.4`; after it comes one op per line: a letter, a tab, then the op. `A` is a model op, `U` a user op, and `T` followed by a date starts a new day (skipped when seeding). `scenes-todo.txt` is plain op lines, scenes separated by a line holding `===`.

## Load one in APERIT

[APERIT](https://github.com/fidenit/aperit) is an app built on PATET. The paths below are relative to a copy of this repository.

Get the files from this repository; the Windows zip does not contain them. Run these from the repository root.

**In the demo** (no key, or `APERIT_DEMO=1`). The board is filled before the window opens:

```sh
APERIT_DEMO=1 APERIT_DEMO_SEED=examples/todo.ops ./run.sh
```

```powershell
$env:APERIT_DEMO = "1"
$env:APERIT_DEMO_SEED = "examples\todo.ops"
.\run.ps1
```

**Scripted turns.** Each message you send plays the next scene:

```sh
APERIT_DEMO=1 APERIT_DEMO_FILE=examples/scenes-todo.txt ./run.sh
```

**With a real engine.** Close APERIT, back up `data/ops.log` in the program folder, copy an `.ops` file over it, and start APERIT. The board is rebuilt from the log and the model edits it from there.

**On a running board.** With the protocol socket on (`APERIT_PROTOCOL_PORT=7878`), send the op of each line (the part after the tab):

```sh
cut -f2 examples/todo.ops | grep -v '^#' | nc 127.0.0.1 7878
```
