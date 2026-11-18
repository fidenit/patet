# `<kite-board>`: KITE Protocol in a web page

A renderer you can put in your own app: one custom element, no dependencies, no build step. It keeps a board, draws it, and tells you what the user did. Bring your own agent and your own transport.

```html
<script type="module" src="kite-board.js"></script>
<kite-board id="board"></kite-board>

<script type="module">
  const board = document.getElementById("board");

  // 1. What your agent writes goes in. Line by line, or as its text streams.
  board.apply("topic ws Team Workshop");                 // "ok"
  board.apply("card k2 decision ws 3x3 Which venue?");   // "ok"
  board.apply("add k2 o1 Gapyeong | Close and cheaper"); // "ok"
  board.apply("card k2 note ws Again");                  // "err exists card 'k2' already exists; ..."

  // 2. What the user does comes out. Send it to your agent.
  board.addEventListener("kite-event", (e) => send(e.detail.entry));   // "user set k2 chosen o1"

  // 3. Before your agent edits, show it the board.
  const ops = board.read();
</script>
```

Files: [`kite-board.js`](kite-board.js) (the element) and [`../js/kite-protocol.js`](../js/kite-protocol.js) (the board, parser and serializer, which you can also use without a page: in Node, a worker, a server).

## Try it

```sh
cd protocol
python -m http.server 8000        # any static server; module scripts do not load from file://
# open http://127.0.0.1:8000/web/
```

The demo page has examples, streams them as a model would, shows the verdicts that were not `ok`, and includes a stand-in agent that reacts when you pick an option.

## API

| | |
|---|---|
| `apply(line, by = "agent")` | Apply one op. Returns the verdict: `ok`, `ok clipped <what> <limit>`, `err <code> <message>`, or `skip` for a blank line or comment |
| `write(text, by = "agent")` | Apply several lines. Returns what was not simply applied: `[{ line, verdict }]`, an array that also carries the counts `applied`, `rejected`, `clipped`. Give the entries back to your model |
| `feed(chunk)`, `end()` | A model's text as it streams: lines are applied as they end. Same return as `write` |
| `read(topic?)` | The board as ops, all of it or one topic |
| `describe()` | What this renderer supports, to tell your agent ([SPEC.md, section 6](../SPEC.md#6-card-types)) |
| `clear()` | Empty the board |
| `board` | The `Board` itself, if you want to look inside |
| event `kite-event` | `detail.entry` is `user <op>`: a tick, a pick, a sent form. It bubbles and crosses the shadow boundary |

| Attribute | |
|---|---|
| `media` | Let writers create `web`, `image` and `doc` cards. Off by default, because they load what the writer chose; without it those ops get `err not-allowed` |
| `theme` | `light` or `dark`. Without it the system setting is followed |

Colors are CSS custom properties on the element (`--bg`, `--card`, `--text`, `--accent`, ...), so it can take your product's look.

## Connecting an agent

The element does not care how lines travel. Three shapes that work:

- **Your own backend, streaming.** Give your model [GUIDE.md](../GUIDE.md) followed by `board.describe()` as its system prompt. For each turn send it the text below, and stream its reply (SSE, WebSocket, fetch stream) into `board.feed(chunk)`.

  ```js
  const turn = (input, events, rejected, earlier) =>
    `<board>\n${board.read()}</board>\n` +
    (events.length ? `<events>\n${events.join("\n")}\n</events>\n` : "") +
    (rejected.length ? `<rejected>\n${rejected.map((p) => `${p.line} → ${p.verdict.replace(/^(err|ok) /, "")}`).join("\n")}\n</rejected>\n` : "") +
    (earlier.length ? `<earlier>\n${earlier.join("\n")}\n</earlier>\n` : "") +
    `<input>${input}</input>`;
  ```

  `events` are the `kite-event` entries since the last turn, `rejected` what `feed` and `end` returned last time, `earlier` the last few `user: ...` / `you: <say>` pairs. Start a turn when the user types, and also when they act on the board (wait a moment first, so a sent form is one turn). Leave out `<earlier>` and a turn started by a gesture goes nowhere: the model no longer knows what was asked. The layout is specified in [SPEC.md, section 10.1](../SPEC.md#101-model-output).
- **Tool calls.** Offer your model a `screen` tool whose input is `ops`; on a call, `board.write(ops)` and return the verdicts as the tool's result.
- **AG-UI.** Follow the binding in [SPEC.md, section 10.5](../SPEC.md#105-ag-ui): the element is the renderer, your AG-UI client carries the events.

## What it draws, and what it does not

All 16 core card types, extension kinds as records, named values, the "my turn" slot for cards that wait for the user, groups, the shelf (a press brings a topic back), light and dark. Charts, routes and drawings are SVG. A table too wide for its card scrolls sideways inside it.

Not yet: dragging and resizing cards (so it never sends `move`, `size`, `pin`), folding a crowded topic, reading `tell` aloud, road-following routes. A route is drawn as straight legs between the stops, without a map underneath.

Every text a writer sends is placed as text, never as HTML.

## Checks

```sh
node protocol/js/test.mjs         # the conformance cases against kite-protocol.js
# open http://127.0.0.1:8000/web/?selftest=1 : the page uses the board as a person would and prints what happened
```
