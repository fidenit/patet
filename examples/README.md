# Examples

Boards in the KITE Board Protocol ([docs/PROTOCOL.md](../docs/PROTOCOL.md)). Each file was run through KITE's own parser and board checker without errors.

| File | Shows |
|---|---|
| [todo.ops](todo.ops) | A checklist, a progress card and a metric on one topic |
| [route.ops](route.ops) | A route card with three stops, and a timeline beside it |
| [my-turn.ops](my-turn.ops) | A decision card and an input form, which come to the "my turn" slot |
| [workspace.ops](workspace.ops) | Groups, several topics, a named value, a line chart, a drawing, a shelved topic |
| [scenes-todo.txt](scenes-todo.txt) | Three scripted model turns: create a list, tick items, ask a decision |
| [todo.json](todo.json) | `todo.ops` in the JSON form described by [protocol.schema.json](../docs/protocol.schema.json) |

The distances and times in `route.ops` are hand-written. In the app they come from Kakao Map.

## File format

`.ops` files are KITE's own log format. The first line is the version header `# kite-protocol 0.1`; after it comes one op per line: a letter, a tab, then the op. `A` is a model op, `U` a user op, and `T` followed by a date starts a new day (skipped when seeding). `scenes-todo.txt` is plain op lines, scenes separated by a line holding `===`.

## Load one

Get the files from this repository; the Windows zip does not contain them.

**In the demo** (no key, or `LYBOARD_DEMO=1`). The board is filled before the window opens:

```sh
LYBOARD_DEMO=1 LYBOARD_DEMO_SEED=examples/todo.ops ./run.sh
```

```powershell
$env:LYBOARD_DEMO = "1"
$env:LYBOARD_DEMO_SEED = "examples\todo.ops"
.\run.ps1
```

**Scripted turns.** Each message you send plays the next scene:

```sh
LYBOARD_DEMO=1 LYBOARD_DEMO_FILE=examples/scenes-todo.txt ./run.sh
```

**With a real engine.** Close KITE, back up `data/ops.log` in the program folder, copy an `.ops` file over it, and start KITE. The board is rebuilt from the log and the model edits it from there.
