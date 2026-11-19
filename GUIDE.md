# PATET guide for agents

You are writing to a screen, not to a chat. The user sees one board of cards. You change it with ops, one per line, and each op takes effect the moment its line ends. The board is your answer; there is no transcript and no reply area.

This guide is for any model or agent that drives a PATET board. The rules are in [SPEC.md](SPEC.md); this is how to use them well.

## Ops

One op per line. No prose, no Markdown, no code fences: a line that is not an op is rejected.

```
say <one line>                               the only sentence on screen: what you changed (80 chars)
topic <id> <name>                            create a topic, or rename it
card <id> <kind> <topic> [<w>x<h>] <title>   create a card, in a topic that exists (on an empty board: `topic` first)
set <id> <field> <value>                     set one field of a card (the value runs to the end of the line)
add <id> <item> <cell> | <cell> ...          add an item to a list-like card
upd <id> <item> <cell> | <cell> ...          replace an existing item
del <id> [<item>]                            remove an item, a card, an empty topic or a group
size <id> <w>x<h>                            resize a card (grid cells, 1 to 8 each)
move <id> <col> <row>                        place a card (rarely needed: placement is automatic)
focus <id>                                   mark the card the user should look at now
let <name> <value>                           a named value; write {name} in any card text to show it
group <id> <name>                            create a group of topics, or rename it
put <topic> <group>                          place a topic in a group
mv <card> <topic>                            move a card to another topic
archive <topic>                              shelve a finished topic with its cards
restore <topic>                              bring a shelved topic back
tell <sentence>                              a sentence to be read aloud (only when the user listens)
```

Ids are short ASCII: `trip` for a topic, `k3` for a card, `r1` for an item. Create before you refer: a topic before its cards, a card before its items, a group before `put`.

A value cannot contain a line break. To put a `|` inside a cell, write `\|`. In a `text` field, the two characters `\n` are shown as a line break; use it sparingly.

## Card types

<!-- parts:begin -->
| Type | Use | Fields (length limit) | Item | Default size |
|---|---|---|---|---|
| status | one state | state: ok/run/wait/fail/idle, text(80) | none | 2x1 |
| metric | one number | value(14), unit(8), delta(14, colored when it starts with + or -), text(60) | none | 2x2 |
| chart | quantities as a picture: comparison (bar), change over time (line), shares (donut) | unit(8), form: bar(default)/line/donut | name \| number | 4x3 |
| route | a route: where the stops are, the shape of the way, distance and time per leg | total(whole distance and time, 40), text(80) | name \| lat,lon \| distance and time to the next stop | 6x5 |
| draw | a drawing no other type can show: structure, flow, seating, relations | text(80) | shape \| coordinates \| text \| color \| size | 5x4 |
| image | a picture file or picture address shown as it is: a photo, a capture, a generated image | src: absolute path of a picture file, or the web address of a picture, text(caption, 80) | none | 4x3 |
| table | a comparison or a list with several attributes | cols: column \| column ... | cell \| cell ... (up to 6 cells) | 4x3 |
| progress | work in progress | pct(0-100), text(60) | done/run/todo/fail \| step name | 3x3 |
| checklist | things to do (the user can tick them) | none | done/todo \| text | 3x3 |
| decision | something the user has to decide (pick one) | text(the question, 120), multi: yes when several may be picked, tone: danger when the choice cannot be undone | option name \| one-line description | 3x3 |
| input | values the user has to give (fill in): a date, a name, a number, an address | text(what is asked and why, 120) | box name (end it with * when it must be filled) \| hint (an example) or the kind of box: date / time / number / slider 0~100 unit / choice A / B / C | 3x3 |
| timeline | things in order of time | none | when \| text \| done/run/todo (optional) | 3x3 |
| note | a short text that fits none of the above | text(240) | none | 3x2 |
| web | a web page or an HTML file shown as it is, in a small browser | url: a web address, or the absolute path of a file on this computer | none | 6x5 |
| record | one thing with named properties that no other type fits: an invoice, a contact, a ticket, a setting | any field name of your choosing, shown as label and value (80 each, up to 12), text(240), cols: column \| column ... (when it has rows) | cell \| cell ... (up to 6 cells, optional) | 3x3 |
| doc | a document, file or link that is too long for the board: shown by name with a summary, opened by the user | src: absolute path of the file, or a web address, text(what it is and what it says, 240) | none | 3x2 |
<!-- parts:end -->

Every card has a `title` (40). When other agents write on the same board, also set `by` (24) on each card you create to the name you go by. A cell holds 60 characters and a card 24 items (a `draw` card 80). Text over a limit is cut, and you are told (`clipped <what> <limit>`): write shorter, or pick a type that fits.

A grid cell is roughly 120 by 95 pixels and a screen is usually 9 to 12 cells wide. Give a card with many items more rows and a table with many columns more width. Make the important card large and the minor ones small.

### Drawing

Numbers and relations read faster as pictures than as text or tables.

- **chart**: `set c1 form line` for change over time (items in time order), `set c1 form donut` for shares of a whole, nothing for bars that compare. Items are `name | number`.
- **draw**: the inside of the card is 0 to 100 across and 0 to 100 down, origin at the top left. One item per shape, drawn in order.

```
add d1 a rect | 5,10 30,20 | Intake | accent        box: top-left x,y and width,height; text in the middle
add d1 b rect | 60,10 30,20 | Review
add d1 c arrow | 35,20 60,20 | 2 days |             arrow through points; text above the middle
add d1 d circle | 50,70 12 | Approved | green       circle: centre x,y and radius
add d1 e line | 10,90 40,60 90,90 | | dim           line through points
add d1 f text | 50,95 | 5 days on average | dim | s text at x,y; size s / (normal) / l
```

  Colors: empty, `accent` (for the single most important thing), `green`, `red`, `amber`, `dim`, `faint`, `white`. Keep shapes from overlapping and text short enough for its box. Use it for order, structure, relations and layout; compare numbers with a chart.

- **input**: each item is a box. The second cell is a hint, or the kind of box: `date`, `number`, or `slider 5~30 unit`.

```
add f1 a Place | e.g. Gapyeong
add f1 b Start date | date
add f1 c People | number
add f1 d Budget per person | slider 5~30 10k KRW
```

- **input**, continued: end a box name with `*` when it must be filled, and use `choice` when the answers are few and known.

```
add f1 e Seat* | choice Window / Aisle / Any
add f1 f Departure* | time
```

- **decision**: `set d1 multi yes` lets the user pick several options (the answer is their ids joined by commas). `set d1 tone danger` marks a choice that cannot be undone, such as deleting or paying; say what will happen in the option's description.

```
card d1 decision trip 3x3 Which days suit you?
set d1 multi yes
add d1 o1 Friday | 12/5
add d1 o2 Saturday | 12/6
add d1 o3 Sunday | 12/7
```

- **record**: one thing with properties of its own. Name the fields yourself; they are shown as labels and values. Use it when the thing is an entity (an invoice, a person, an order), not a comparison (that is a table).

```
card r1 record sales 3x3 Invoice 1042
set r1 customer Acme Ltd
set r1 due 2026-12-01
set r1 total 1,200 USD
set r1 status sent
```

- **doc**: when the result is long (a report, a draft, code) and you can write files, write it to a file and put a `doc` card on the board that says what it is. Never paste a document into cards. Without a way to write files, give the conclusion on cards and say that the full text is not on the board.

```
card f1 doc report 3x2 Q3 sales report
set f1 src C:\Users\me\reports\q3.md
set f1 text Revenue up 12%, two regions behind plan. 6 pages.
```

### Kinds a renderer adds

A renderer may draw kinds of its own, named `x-...` (for example `x-kanban`). It tells you which ones it has. A card of an `x-` kind is written like a `record`: fields you name, and rows. A renderer that does not know that kind shows it as a record, so nothing is lost. Use only the kinds your renderer listed; a name it does not list and that does not start with `x-` is rejected.

### Named values

When the same value appears on several cards (a budget, a headcount, a deadline), name it and write `{name}` on the cards. One `let` line then changes them all.

```
let people 12
set m1 value {people}
add k2 i3 todo | Book a table for {people}
```

## Principles

1. **Less text is the point.** When you want to write a paragraph, stop and ask what it is: a comparison (table, chart), an order (timeline, progress), things to do (checklist), a choice (decision), a number (metric), a state (status). A note is the last resort.
2. **Conclusions only.** Process, lists of reasons and asides stay off the board. If the user asks about one, make a card for that part then.
3. **Edit, do not pile up.** When a subject comes back, change its cards with set/add/upd/del instead of creating new ones. Delete what is finished or stale. The board is the present state, not a history.
4. **Go and get the answer you need.** Do not ask in `say` and wait. Put a `decision` card (to pick) or an `input` card (to fill in) in the topic the question belongs to, with a title and a question that make sense on their own. The renderer brings one such card at a time to the user. When the answer arrives, delete that card and act on it. A checklist is for the user's own to-dos, never for collecting answers.
5. **`say` is the one sentence.** One short line about what changed, first in your output. The content of the answer goes into cards, not into `say`.
6. **Pinned cards stay put.** A card the user moved or resized cannot be moved or resized by you. Its content can still change.
7. **One topic per subject.** A new subject gets a new topic, named in two or three words that tell what it is ("Weekend cleanup", not "Prep"). A card title does not repeat the topic name.
8. **Write in the user's language.**

## Know your renderer

Renderers differ: a phone may have no web cards, another may add kinds. A renderer describes itself (the `hello` command of a line session, the end of this guide over MCP, `state.patet.renderer` over AG-UI) in lines like these:

```
patet 0.5
renderer APERIT 0.4.0
kinds status metric chart route draw image table progress checklist decision input timeline note record doc
features tell
```

Create only the kinds listed: a kind of the table above that is missing from the list (often `web`, `image`, `doc`) is not available here. `tell` under features means it can read aloud. If you were told nothing, assume the core kinds of the table above and no features.

## How a turn reaches you

Each turn you are given the state and what happened, in tags like these (a renderer may add its own):

```
<board>      the board as ops; empty when nothing is on it
<events>     what the user did since your last turn, one entry per line
<rejected>   lines of your last turn that were rejected or clipped, with the reason
<earlier>    the last things the user said, and what you answered
<input>      what the user says now; empty when they only acted on the board
```

Your whole reply is ops, one per line. Nothing else: no greeting, no explanation, no Markdown.

When `<input>` is empty the user did not speak; they answered or acted on the board. Read `<events>` to see what they did and `<earlier>` to remember what they asked for, and carry that request forward.

## Reading the board

The board comes to you as the same ops you write (`topic`, `card`, `set`, `add`, then `move` and `pin` for cards the user placed). A line starting with `#` is a note for you, never data and never something to write back. On a large board, topics far from the current subject may be shortened to card titles or to a card count, each with a `#` note; read such a topic in full before you edit it or answer from it. A card you cannot see may still exist: check the topic list before creating a topic, and keep new ids different from every id in use.

## What the user does

The user's gestures arrive as event entries: `user` and the op they authored.

```
user set k3 chosen o2                         picked option o2 of decision card k3
user upd f1 a Start date | date | 12/3        filled a box of input card f1 (the last cell is the value)
user set f1 sent yes                          sent the input card
user upd k2 i3 done | Pack the kitchen        ticked a checklist item (todo: unticked)
```

These are already on the board. **Never write them yourself**: an op of yours that sets `chosen` or `sent`, or that fills the third cell of an input box, is rejected (`user-only`). You ask; the user answers.

React to what happened, and only to that.

- **A picked option:** delete the decision card (`del k3`), record the decision on another card, and show the next step.
- **A sent form:** read the values from the `upd` entries, delete the input card (`del f1`), put the values where they belong (a `record`, a `status`, the cards that depended on them), and go on with what the user asked for. If a value is unclear, ask again with a new card; do not guess.
- **A tick:** change only what that progress changes (a status, a percentage, the next thing to do). Do not write the tick back.
- **Nothing to change:** one `say` line and no new card.

A form, from asking to acting on it:

```
say I need two things to book it.
card f1 input trip 3x3 Dates and people
set f1 text Needed to book the stay
add f1 a Start date* | date
add f1 b People* | number
```

The user fills it in and sends it. You receive `user upd f1 a Start date* | date | 2026-12-05`, `user upd f1 b People* | number | 4` and `user set f1 sent yes`, and answer:

```
say Booked for four, from December 5.
del f1
card r1 record trip 3x2 Booking
set r1 from 2026-12-05
set r1 people 4
```

## Growing boards

- From about five topics on, group them: `group work Work`, then `put <topic> work`. Groups are broad areas of life or work, three to six of them (eight at most). Once a group exists, put every new topic in one.
- Finished work is shelved, not deleted: `archive <topic>`. When the user mentions it again, `restore <topic>` and continue on its cards. Ids on the shelf stay reserved.
- Keep the structure tidy without being asked: rename a topic that drifted, merge two that overlap (`mv` the cards, `del` the empty one), split a group that grew too large.

## If you have tools

This section applies to an agent that can run tools (files, commands, the web). Skip it otherwise.

- Before your first tool call of a turn, write one `say` so the screen is not silent.
- For work with several steps, show a `progress` card with three or four steps in the user's words, update it as you go, and replace it with the result when done. Skip it for work that takes one or two calls.
- Show a failure plainly: a `status` card in state `fail` with one line on what did not work.

## Speaking

When the user is listening, answer aloud once per turn, at the end: put the cards up first, then one `tell` with the gist and, if there is one, the question. One or two sentences. Do not read out what is on the cards.

## Example

Input: "pick a venue for next week's team workshop, Gangneung or Gapyeong", on an empty board.

```
say Two venues compared. Pick one.
topic ws Team Workshop
card k1 table ws 5x2 Venue comparison
set k1 cols Venue | Travel | Cost per person | Notes
add k1 r1 Gangneung | 2h 40m | 180,000 KRW | Sea, large meeting room
add k1 r2 Gapyeong | 1h 10m | 120,000 KRW | Close, small lodging
card k2 decision ws 3x2 Which venue?
set k2 text Where should the workshop be?
add k2 o1 Gangneung | Far, but better facilities
add k2 o2 Gapyeong | Close and cheaper
focus k2
```

The user picks Gapyeong. You receive `set k2 chosen o2` and answer:

```
say Gapyeong it is.
del k2
card s1 status ws 3x1 Venue
set s1 state ok
set s1 text Gapyeong chosen
```
