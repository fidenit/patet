# Quickstart: make your model answer with a board

Ten minutes, any model that can produce text. You need three things: the guide as the system prompt, a board that checks each line, and a loop that tells the model what happened.

## 1. The system prompt is a file

Give your model [GUIDE.md](GUIDE.md) as it is, followed by what your renderer can draw:

```
<contents of GUIDE.md>

## Your renderer

patet 0.4
renderer my-app 1.0
kinds status metric chart table progress checklist decision input timeline note record
```

This is the renderer's description ([SPEC.md, section 6](SPEC.md#what-a-renderer-supports)). Leave out the kinds you do not draw. The model reads this list and stays inside it.

## 2. A turn is five parts

Send the model one user message per turn, in this layout ([SPEC.md, section 10.1](SPEC.md#101-model-output)):

```
<board>
(the board as ops: what serialize() returns)
</board>
<events>
user set k2 chosen o2
</events>
<rejected>
card k9 note nowhere Hi → no-such-topic no topic 'nowhere'; create it first with: topic nowhere <name>
</rejected>
<earlier>
user: pick a venue for next week's workshop
you: Two venues compared. Pick one.
</earlier>
<input>what the user typed now, or empty when they only pressed something</input>
```

The model keeps no memory of its own. The board is the memory.

## 3. Apply the answer line by line

The model's whole answer is ops, one per line. Feed it to a board as it streams. Each line gets a verdict.

**JavaScript** (Node or a browser, no dependencies):

```js
import { Board, LineStream, serialize } from "./js/patet.js";

const board = new Board();
const stream = new LineStream();
const rejected = [];

function take(lines) {
  for (const line of lines) {
    const verdict = board.line(line);                 // "ok", "ok clipped ...", "err <code> <message>", "skip"
    if (verdict.startsWith("err")) rejected.push(`${line} → ${verdict.slice(4)}`);
    else if (verdict !== "ok" && verdict !== "skip") rejected.push(`${line} → ${verdict.slice(3)}`);
  }
}

for await (const delta of modelStream) take(stream.feed(delta));   // draws while the model is still writing
const rest = stream.finish();
if (rest) take([rest]);

const next = serialize(board);                        // the <board> of the next turn
```

**Python** (standard library only):

```python
from patet import Board, LineStream, serialize

board, stream, rejected = Board(), LineStream(), []

def take(lines):
    for line in lines:
        verdict = board.line(line)
        if verdict.startswith("err"):
            rejected.append(f"{line} → {verdict[4:]}")
        elif verdict not in ("ok", "skip"):
            rejected.append(f"{line} → {verdict[3:]}")

for delta in model_stream:
    take(stream.feed(delta))
rest = stream.finish()
if rest:
    take([rest])

next_board = serialize(board)
```

**Rust**: see the example in [README.md](README.md#use-it).

## 4. Draw it

- On the web, do not write a renderer: [`<patet-board>`](web) is one custom element. `board.apply(line)` takes the model's lines and the `patet-event` event gives back what the user did.
- Anywhere else, draw the cards of `board` yourself. A card has a kind, a title, fields and items; the card types and what each field means are the table in [GUIDE.md](GUIDE.md#card-types). Start with `note`, `table`, `checklist` and `decision` and you already have a useful board.

## 5. What the user does goes back the same way

When the user picks an option, ticks a box or sends a form, apply it to your board as an op by the user, and put it in `<events>` of the next turn:

```js
board.line("set k2 chosen o2", "user");   // the user picked option o2 of card k2
events.push("user set k2 chosen o2");     // tell the model on the next turn
```

Start that turn at once, with an empty `<input>`. Only the user may set `chosen` or `sent`: the same line from the model is rejected.

## 6. Two rules that save you a day

1. **If lines were rejected, run one more turn at once**, with an empty `<input>` and the rejected lines in `<rejected>`. Otherwise the user stares at a board that lacks what the model meant to show. One such turn, not a loop.
2. **Do not parse prose.** A line that is not an op is rejected (`unknown-verb`). That is the protocol working: the model is told, and writes ops the next time.

## Check your work

- `python -m patet check answer.txt` prints every line of a saved answer that was not simply applied.
- Run the [conformance cases](conformance) against your own board if you wrote one.
- For a model that keeps writing invalid lines, constrain it with the [grammar](grammar).

## Other ways in

You do not have to host the model yourself. A renderer can also be driven from outside: over MCP (tools `screen`, `board_read`, `events`, `guide`), over AG-UI, or over a plain line socket ([SPEC.md, section 10](SPEC.md#10-bindings)).
