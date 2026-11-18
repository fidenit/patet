# `<patet-board>`: PATET in a web page

A renderer you can put in your own app: one custom element, no dependencies, no build step. It keeps a board, draws it, and tells you what the user did. Bring your own agent and your own transport.

**Want to see it run first?** [examples/assistant](../examples/assistant) is a whole assistant in two files, with a real model behind it.

```html
<script type="module" src="patet-board.js"></script>
<patet-board id="board"></patet-board>

<script type="module">
  const board = document.getElementById("board");

  // 1. What your agent writes goes in. Line by line, or as its text streams.
  board.apply("topic ws Team Workshop");                 // "ok"
  board.apply("card k2 decision ws 3x3 Which venue?");   // "ok"
  board.apply("add k2 o1 Gapyeong | Close and cheaper"); // "ok"
  board.apply("card k2 note ws Again");                  // "err exists card 'k2' already exists; ..."

  // 2. What the user does comes out. Send it to your agent.
  board.addEventListener("patet-event", (e) => send(e.detail.entry));   // "user set k2 chosen o1"

  // 3. Before your agent edits, show it the board.
  const ops = board.read();
</script>
```

## Getting the files

Two files, and they must keep their places relative to each other, because the element imports `../js/patet.js`:

```
your-site/
  web/patet-board.js     the element
  js/patet.js            the board, the parser and the serializer (also usable alone: Node, a worker, a server)
```

Copy the two folders from this repository, or load the element straight from it without copying anything:

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/fidenit/patet@main/web/patet-board.js"></script>
```

For anything you ship, replace `@main` with a commit id so the file cannot change under you. There is no npm package yet.

## Try it

From the root of this repository:

```sh
python -m http.server 8000        # any static server; module scripts do not load from file://
# open http://127.0.0.1:8000/web/
```

The demo page has examples, streams them as a model would, shows the verdicts that were not `ok`, and includes a stand-in agent that reacts when you pick an option.

## API

| | |
|---|---|
| `apply(line, by = "agent")` | Apply one op. Returns the verdict: `ok`, `ok clipped <what> <limit>`, `err <code> <message>`, or `skip` for a blank line or comment. `by` is `"agent"`, `"user"` or `"restore"` |
| `write(text, by = "agent")` | Apply several lines. Returns what was not simply applied: `[{ line, verdict }]`, an array that also carries the counts `applied`, `rejected`, `clipped`. Give the entries back to your model |
| `feed(chunk)`, `end()` | A model's text as it streams: lines are applied as they end. Same return as `write` |
| `read(topic?)` | The board as ops, all of it or one topic |
| `load(ops, { say, focus })` | Replace the board with one written back as ops: what `read()` gave earlier, or the board your server keeps. Answers and pins come back as they were |
| `describe()` | What this renderer supports, to tell your agent ([SPEC.md, section 6](../SPEC.md#6-card-types)) |
| `clear()` | Empty the board |
| `board` | The `Board` itself: `board.cards`, `board.topics`, `board.say`, `board.focus` |
| event `patet-event` | `detail.entry` is `user <op>`: a tick, a pick, a sent form. It bubbles and crosses the shadow boundary |

| Attribute | |
|---|---|
| `media` | Let writers create `web`, `image` and `doc` cards. Off by default, because they load what the writer chose; without it those ops get `err not-allowed` and `describe()` leaves the three kinds out |
| `theme` | `light` or `dark`. Without it the system setting is followed, so a product with one look should set it |

## Theming

Everything is a CSS custom property on the element. Set them in your own stylesheet; nothing inside the element has to be touched.

```css
patet-board {
  --accent: #7c3aed;  --primary: #7c3aed;  --primary-text: #fff;
  --bg: #0b1020;  --card: #141a2e;
  --radius: 8px;
  --font: Georgia, serif;
}
```

| Variable | Paints |
|---|---|
| `--bg` | the background behind everything |
| `--panel` | the "my turn" panel on the left |
| `--card` | cards, and options not chosen |
| `--raised` | input boxes, the track of a bar, a hovered option |
| `--line` | borders of cards, topics and options |
| `--edge` | the border of the focused card and of the card in "my turn" |
| `--text`, `--soft`, `--dim`, `--faint` | text, from the strongest (titles, values) to the weakest (labels, hints) |
| `--accent` | small marks: the dot and the count of "my turn", the topic label on a card, links, the colour named `accent` in a drawing |
| `--primary`, `--primary-text` | the buttons that act: Send, Done, a chosen option, a chosen pill. They default to `--on` and `--on-text` |
| `--on`, `--on-text` | the default of `--primary`: near-white in dark, near-black in light |
| `--green`, `--red`, `--amber` | states (`ok`, `fail`, `wait`), ticks, rises and falls, a `danger` decision, and the colours of those names in a drawing |
| `--radius` | the corner of a card (20px); every other corner follows it in proportion |
| `--font` | the font of all text, charts and drawings included |

The light and dark sets change the greys only (`--bg` to `--faint`, `--on`, `--on-text`). What you set yourself wins over both.

For what a variable cannot say, three parts are exposed: `patet-board::part(card)` (each card, also `::part(decision)`, `::part(table)` and so on by kind), `::part(topic)` (the frame around a topic's cards) and `::part(turn)` (the "my turn" panel).

Layout is not yours to set from outside, by design: the writer gives a size in grid cells and the element places the cards. Give the element the width you want it to have.

## What you will see

- **"My turn"**, on the left: the `say` line, and the cards that wait for the user (`decision`, `input`), one at a time. Such a card is shown there and not in its topic, so the topic's count can be lower than its number of cards.
- **Topics**, each a frame with its cards; groups as headings above them; the shelf as a row of buttons that bring a topic back.
- Nothing else. There is no chat log: what was said is not kept on screen.

## Connecting an agent

The element does not care how lines travel. Three shapes that work:

- **Your own backend, streaming.** Give your model [GUIDE.md](../GUIDE.md) followed by `board.describe()` as its system prompt. For each turn send it the text below, and stream its reply (SSE, WebSocket, fetch stream) into `board.feed(chunk)`. [examples/assistant](../examples/assistant) is exactly this, complete.

  ```js
  const turn = (input, events, rejected, earlier) =>
    `<board>\n${board.read()}</board>\n` +
    (events.length ? `<events>\n${events.join("\n")}\n</events>\n` : "") +
    (rejected.length ? `<rejected>\n${rejected.map((p) => `${p.line} → ${p.verdict.replace(/^(err|ok) /, "")}`).join("\n")}\n</rejected>\n` : "") +
    (earlier.length ? `<earlier>\n${earlier.join("\n")}\n</earlier>\n` : "") +
    `<input>${input}</input>`;
  ```

  `events` are the `patet-event` entries since the last turn, `rejected` what `feed` and `end` returned last time, `earlier` the last few `user: ...` / `you: <say>` pairs. Start a turn when the user types, and also when they act on the board (wait a moment first, so a sent form is one turn). Leave out `<earlier>` and a turn started by a gesture goes nowhere: the model no longer knows what was asked. The layout is specified in [SPEC.md, section 10.1](../SPEC.md#101-model-output).
- **Tool calls.** Offer your model a `screen` tool whose input is `ops`; on a call, `board.write(ops)` and return the verdicts as the tool's result.
- **AG-UI.** Follow the binding in [SPEC.md, section 10.5](../SPEC.md#105-ag-ui): the element is the renderer, your AG-UI client carries the events.

### When the server keeps the board

In the shapes above the page's own board is the one that judges. If your server must be the judge (several pages on one board, a board that outlives the page, checks in Python), keep a board there and let the page only draw:

1. The server applies each line of the model to its board (`Board.line` in [js/](../js), [python/](../python), [rust/](../rust)) and sends the page the lines that were accepted. The page calls `board.apply(line)`.
2. What the user does comes out of the page as `patet-event`. Send the op to the server, which applies it with the author `user` and puts it in `<events>` of the next turn.
3. When a page opens or falls out of step, send it the server's whole board and call `board.load(ops, { say, focus })`. `say` and `focus` are not part of a written board, so send them beside it.
4. Both sides must agree on media: if the page has no `media` attribute, leave `web`, `image` and `doc` out of what you describe to the model (`describe(media=False)` in Python, `describe({ media: false })` in JavaScript) and refuse those cards on the server too.

The two boards stay equal because every implementation passes the same [conformance cases](../conformance); comparing `board.read()` with the server's `serialize` is a cheap check.

## Scripting it in a test

The shadow root is open. The handles a test needs: `article[data-id="<card id>"]` is a card; `button.opt` an option of a decision; `button.check` a tick box; `input[data-key="<card>:<item>"]` a box of a form; `button.pill` a choice in a form; `button.go` Send or Done.

```js
board.shadowRoot.querySelector('article[data-id="k2"] button.opt').click();   // picks the first option of k2
```

## What it draws, and what it does not

All 16 core card types, extension kinds as records, named values, the "my turn" slot for cards that wait for the user, groups, the shelf (a press brings a topic back), light and dark. Charts, routes and drawings are SVG. A table too wide for its card scrolls sideways inside it.

Not yet: dragging and resizing cards (so it never sends `move`, `size`, `pin`), folding a crowded topic, reading `tell` aloud, road-following routes. A route is drawn as straight legs between the stops, without a map underneath.

Every text a writer sends is placed as text, never as HTML.

## Checks

From the root of this repository:

```sh
node js/test.mjs                  # the conformance cases against patet.js
# open http://127.0.0.1:8000/web/?selftest=1 : the page uses the board as a person would and prints what happened
```
