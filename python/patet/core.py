"""The board: what the ops build, the checks every op passes, and the board written back as ops."""

from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, NamedTuple, Optional, Tuple

from .lang import VERSION, WS, Op, Reject, join_cells, parse

_ID = "(1 to 24 letters, digits, _ or -)"
_ID_ASCII = frozenset("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")

LIMITS: Dict[str, int] = {
    "id": 24, "title": 40, "topic": 24, "group": 16, "cell": 60, "cells": 6, "items": 24, "draw_items": 80,
    "groups": 8, "vars": 64, "say": 80, "size": 8, "record_field": 80, "record_fields": 12,
}


class Part(NamedTuple):
    """A card type: name, default size, fields as (name, limit, description), item shape.

    An empty description marks a field the renderer sets; an empty ``items`` a type without items.
    """

    name: str
    size: Tuple[int, int]
    purpose: str
    fields: Tuple[Tuple[str, int, str], ...]
    items: str


PARTS: Tuple[Part, ...] = (
    Part("status", (2, 1), "one state", (("state", 8, "state: ok/run/wait/fail/idle"), ("text", 80, "text(80)")), ""),
    Part("metric", (2, 2), "one number", (("value", 14, "value(14)"), ("unit", 8, "unit(8)"), ("delta", 14, "delta(14, colored when it starts with + or -)"), ("text", 60, "text(60)")), ""),
    Part("chart", (4, 3), "quantities as a picture: comparison (bar), change over time (line), shares (donut)", (("unit", 8, "unit(8)"), ("form", 8, "form: bar(default)/line/donut")), "name | number"),
    Part("route", (6, 5), "a route: where the stops are, the shape of the way, distance and time per leg", (("total", 40, "total(whole distance and time, 40)"), ("text", 80, "text(80)")), "name | lat,lon | distance and time to the next stop"),
    Part("draw", (5, 4), "a drawing no other type can show: structure, flow, seating, relations", (("text", 80, "text(80)"),), "shape | coordinates | text | color | size"),
    Part("image", (4, 3), "a picture file or picture address shown as it is: a photo, a capture, a generated image", (("src", 600, "src: absolute path of a picture file, or the web address of a picture"), ("text", 80, "text(caption, 80)")), ""),
    Part("table", (4, 3), "a comparison or a list with several attributes", (("cols", 200, "cols: column | column ..."),), "cell | cell ... (up to 6 cells)"),
    Part("progress", (3, 3), "work in progress", (("pct", 3, "pct(0-100)"), ("text", 60, "text(60)")), "done/run/todo/fail | step name"),
    Part("checklist", (3, 3), "things to do (the user can tick them)", (), "done/todo | text"),
    Part("decision", (3, 3), "something the user has to decide (pick one)", (("text", 120, "text(the question, 120)"), ("multi", 8, "multi: yes when several may be picked"), ("tone", 8, "tone: danger when the choice cannot be undone"), ("chosen", 120, "")), "option name | one-line description"),
    Part("input", (3, 3), "values the user has to give (fill in): a date, a name, a number, an address", (("text", 120, "text(what is asked and why, 120)"), ("sent", 8, "")), "box name (end it with * when it must be filled) | hint (an example) or the kind of box: date / time / number / slider 0~100 unit / choice A / B / C"),
    Part("timeline", (3, 3), "things in order of time", (), "when | text | done/run/todo (optional)"),
    Part("note", (3, 2), "a short text that fits none of the above", (("text", 240, "text(240)"),), ""),
    Part("web", (6, 5), "a web page or an HTML file shown as it is, in a small browser", (("url", 600, "url: a web address, or the absolute path of a file on this computer"),), ""),
    Part("record", (3, 3), "one thing with named properties that no other type fits: an invoice, a contact, a ticket, a setting", (("text", 240, "any field name of your choosing, shown as label and value (80 each, up to 12), text(240)"), ("cols", 200, "cols: column | column ... (when it has rows)")), "cell | cell ... (up to 6 cells, optional)"),
    Part("doc", (3, 2), "a document, file or link that is too long for the board: shown by name with a summary, opened by the user", (("src", 600, "src: absolute path of the file, or a web address"), ("text", 240, "text(what it is and what it says, 240)")), ""),
)
_PART: Dict[str, Part] = {p.name: p for p in PARTS}


def kind_names() -> List[str]:
    return [p.name for p in PARTS]


#: Card types that make a renderer load or open what the writer chose. A renderer that takes ops from
#: outside its own process leaves them out of what it describes unless the user allowed them (SPEC.md section 11).
MEDIA_KINDS = ("web", "image", "doc")


def describe(renderer: str = "patet-python 0.4", media: bool = False, extra_kinds: Iterable[str] = (), features: Iterable[str] = ()) -> List[str]:
    """What a renderer supports, one line per entry (SPEC.md section 6): give it to the model after GUIDE.md.

    `extra_kinds` are the extension kinds (`x-...`) you draw yourself; `features` is `tell` when you can read aloud.
    """
    kinds = [k for k in kind_names() if media or k not in MEDIA_KINDS] + list(extra_kinds)
    out = [f"patet {VERSION}", f"renderer {renderer}", "kinds " + " ".join(kinds)]
    features = list(features)
    if features:
        out.append("features " + " ".join(features))
    return out


def parts_table() -> str:
    """The card type table for a model (Markdown), the same text the reference implementation builds."""

    def cell(s: str) -> str:
        return "none" if s == "" else s.replace("|", "\\|")

    t = "| Type | Use | Fields (length limit) | Item | Default size |\n|---|---|---|---|---|\n"
    for p in PARTS:
        fields = ", ".join(f[2] for f in p.fields if f[2] != "")
        t += f"| {p.name} | {p.purpose} | {cell(fields)} | {cell(p.items)} | {p.size[0]}x{p.size[1]} |\n"
    return t


# Lengths are counted in Unicode characters (code points), which is what len() of a str gives.
def _clip(s: str, limit: int) -> str:
    return s if len(s) <= limit else s[: max(0, limit - 1)] + "…"


def valid_id(id: str) -> bool:
    """1 to 24 characters: an ASCII letter or digit, ``_``, ``-``, or any character outside ASCII that is
    neither white space nor a control character."""
    return id != "" and len(id) <= LIMITS["id"] and all(_id_char(c) for c in id)


def _id_char(c: str) -> bool:
    if c < "\x80":
        return c in _ID_ASCII
    return c not in WS and unicodedata.category(c) != "Cc"


def is_extension_kind(name: str) -> bool:
    """``x-`` and then an id. A renderer that does not draw the kind treats the card as a ``record``."""
    return name.startswith("x-") and valid_id(name[2:]) and len(name) <= LIMITS["id"]


def asks(kind: str) -> bool:
    """Does a card of this type wait for the user's answer?"""
    return kind in ("decision", "input")


def _field_limit(kind: str, name: str) -> Optional[int]:
    if name == "title":
        return LIMITS["title"]
    for f in _PART[kind].fields:
        if f[0] == name:
            return f[1]
    return LIMITS["record_field"] if kind == "record" and valid_id(name) else None


_NUMBER_RE = re.compile(r"[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?")
_PCT_RE = re.compile(r"\+?[0-9]+")
_VAR_RE = re.compile(r"\{([^{}" + WS + r"]+)\}")


def _number(s: str) -> bool:
    s = s.strip(WS)
    return _NUMBER_RE.fullmatch(s) is not None and math.isfinite(float(s))


@dataclass
class Group:
    id: str
    name: str


@dataclass
class Topic:
    id: str
    name: str
    group: Optional[str] = None


@dataclass
class Item:
    id: str
    cells: List[str]


@dataclass
class Card:
    id: str
    kind: str  #: one of the 16 types; a card of an extension kind is held as ``record``
    topic: str
    title: str
    w: int
    h: int
    ext: Optional[str] = None  #: the extension kind as written (``x-...``), or None
    fields: Dict[str, str] = field(default_factory=dict)
    items: List[Item] = field(default_factory=list)
    grid: Optional[Tuple[int, int]] = None  #: (col, row) when placed by ``move``
    pinned: bool = False
    rev: int = 1  #: grows with every change to the card

    @property
    def kind_name(self) -> str:
        """The kind as the writer named it."""
        return self.ext or self.kind

    def item(self, id: str) -> Optional[Item]:
        return next((i for i in self.items if i.id == id), None)


@dataclass
class Shelved:
    topic: Topic
    cards: List[Card]


class Board:
    """A board of cards. ``line`` applies one line and returns its verdict."""

    def __init__(self) -> None:
        self.groups: List[Group] = []
        self.topics: List[Topic] = []
        self.cards: List[Card] = []
        self.shelf: List[Shelved] = []
        self.vars: Dict[str, str] = {}
        self.say = ""
        self.focus: Optional[str] = None
        #: Notes about ops applied with a change: ``clipped <what> <limit>``. Whoever relays verdicts drains this.
        self.notes: List[str] = []

    def card(self, id: str) -> Optional[Card]:
        return next((c for c in self.cards if c.id == id), None)

    def topic(self, id: str) -> Optional[Topic]:
        return next((t for t in self.topics if t.id == id), None)

    def group(self, id: str) -> Optional[Group]:
        return next((g for g in self.groups if g.id == id), None)

    def _card(self, id: str) -> Card:
        c = self.card(id)
        if c is None:
            raise Reject("no-such-card", f"no card '{id}'")
        return c

    def line(self, raw: str, by: str = "agent") -> str:
        """Parse and apply one line. Returns the verdict: ``skip``, ``ok``, ``ok clipped ...`` or ``err <code> <message>``."""
        try:
            op = parse(raw)
            if op is None:
                return "skip"
            self.apply(op, by)
        except Reject as e:
            return f"err {e.line}"
        notes, self.notes = self.notes, []
        return "ok " + "; ".join(notes) if notes else "ok"

    def show(self, s: str) -> str:
        """Show ``{name}`` in a text as the named value."""
        if not self.vars or "{" not in s:
            return s
        return _VAR_RE.sub(lambda m: self.vars.get(m.group(1), m.group(0)), s)

    def apply(self, op: Op, by: str = "agent") -> None:
        """Check one op and apply it. Raises :class:`Reject`; a rejected op changes nothing. 

        ``by`` is "agent" or "user". A third author, "restore", is for replaying a saved board: it has the
        user's rights, but its ``move`` and ``size`` do not pin the card. It is not an author on the wire.
        """
        agent = by not in ("user", "restore")
        pins = by == "user"
        verb = op["op"]
        if verb == "topic":
            id = op["id"]
            if not valid_id(id):
                raise Reject("bad-id", f"topic id '{id}' is not valid {_ID}")
            if any(s.topic.id == id for s in self.shelf):
                raise Reject("shelved", f"topic '{id}' is on the shelf; bring it back with: restore {id}")
            name = _clip(op["name"] or id, LIMITS["topic"])
            t = self.topic(id)
            if t:
                t.name = name
            else:
                self.topics.append(Topic(id, name))
        elif verb == "group":
            id = op["id"]
            if not valid_id(id):
                raise Reject("bad-id", f"group id '{id}' is not valid {_ID}")
            if any(s.topic.id == id or any(c.id == id for c in s.cards) for s in self.shelf):
                raise Reject("shelved", f"'{id}' is the id of a topic or a card on the shelf; use another id")
            if self.topic(id) or self.card(id):
                raise Reject("id-in-use", f"'{id}' is already the id of a topic or a card")
            name = _clip(op["name"] or id, LIMITS["group"])
            g = self.group(id)
            if g:
                g.name = name
            else:
                if len(self.groups) >= LIMITS["groups"]:
                    raise Reject("limit", f"at most {LIMITS['groups']} groups; make the groups broader")
                self.groups.append(Group(id, name))
        elif verb == "mv":
            if not self.topic(op["topic"]):
                raise Reject("no-such-topic", f"no topic '{op['topic']}'")
            c = self._card(op["card"])
            c.topic = op["topic"]
            c.grid = None
            c.pinned = False
            c.rev += 1
        elif verb == "put":
            if not self.group(op["group"]):
                raise Reject("no-such-group", f"no group '{op['group']}'; create it first with: group {op['group']} <name>")
            t = self.topic(op["topic"])
            if not t:
                raise Reject("no-such-topic", f"no topic '{op['topic']}'")
            t.group = op["group"]
        elif verb == "card":
            self._new_card(op)
        elif verb == "set":
            self._set(op["id"], op["field"], op["value"], agent)
        elif verb in ("add", "upd"):
            self._put_item(op["id"], op["item"], op["cells"], verb == "upd", agent)
        elif verb == "del":
            self._del(op["id"], op.get("item"))
        elif verb == "size":
            c = self._card(op["id"])
            if agent and c.pinned:
                raise Reject("pinned", f"the user pinned '{op['id']}'; its size cannot be changed")
            c.w = min(max(op["w"], 1), LIMITS["size"])
            c.h = min(max(op["h"], 1), LIMITS["size"])
            if pins:
                c.pinned = True
            c.rev += 1
        elif verb == "move":
            c = self._card(op["id"])
            if agent and c.pinned:
                raise Reject("pinned", f"the user pinned '{op['id']}'; it cannot be moved")
            c.grid = (max(op["col"], 0), max(op["row"], 0))
            if pins:
                c.pinned = True
        elif verb == "pin":
            if agent:
                raise Reject("user-only", "only the user can pin or unpin")
            c = self._card(op["id"])
            c.pinned = bool(op["on"])
            if not c.pinned:
                c.grid = None
        elif verb == "focus":
            self._card(op["id"])
            self.focus = op["id"]
        elif verb == "let":
            name, value = op["name"], op["value"]
            if not valid_id(name):
                raise Reject("bad-id", f"value name '{name}' is not valid {_ID}")
            if value.strip(WS) == "":
                self.vars.pop(name, None)
                return
            if name not in self.vars and len(self.vars) >= LIMITS["vars"]:
                raise Reject("limit", f"at most {LIMITS['vars']} named values")
            if len(value) > LIMITS["cell"]:
                self.notes.append(f"clipped let.{name} {LIMITS['cell']}")
            self.vars[name] = _clip(value.strip(WS), LIMITS["cell"])
        elif verb == "archive":
            t = self.topic(op["topic"])
            if not t:
                raise Reject("no-such-topic", f"no topic '{op['topic']}'")
            self.topics = [x for x in self.topics if x is not t]
            gone = [c for c in self.cards if c.topic == t.id]
            self.cards = [c for c in self.cards if c.topic != t.id]
            if any(c.id == self.focus for c in gone):
                self.focus = None
            self.shelf.append(Shelved(t, gone))
        elif verb == "restore":
            s = next((x for x in self.shelf if x.topic.id == op["topic"]), None)
            if not s:
                raise Reject("not-shelved", f"no topic '{op['topic']}' on the shelf")
            self.shelf = [x for x in self.shelf if x is not s]
            if s.topic.group is not None and not self.group(s.topic.group):
                s.topic.group = None
            self.topics.append(s.topic)
            for c in s.cards:
                c.rev += 1
                self.cards.append(c)
        elif verb == "say":
            if len(op["text"]) > LIMITS["say"]:
                self.notes.append(f"clipped say {LIMITS['say']}")
            self.say = _clip(op["text"], LIMITS["say"])
        else:
            raise Reject("unknown-verb", f"unknown op '{verb}'")

    def _new_card(self, op: Op) -> None:
        id, kind_name, topic, title = op["id"], op["kind"], op["topic"], op["title"]
        if any(c.id == id for s in self.shelf for c in s.cards):
            raise Reject("shelved", f"card id '{id}' belongs to a card on the shelf; use another id")
        if not valid_id(id):
            raise Reject("bad-id", f"card id '{id}' is not valid {_ID}")
        if self.card(id):
            raise Reject("exists", f"card '{id}' already exists; change it with set/add/upd instead of creating it again")
        known = kind_name in _PART
        if not known and not is_extension_kind(kind_name):
            raise Reject("unknown-kind", f"no card type '{kind_name}'")
        kind = kind_name if known else "record"
        if not self.topic(topic):
            raise Reject("no-such-topic", f"no topic '{topic}'; create it first with: topic {topic} <name>")
        w, h = op.get("size") or _PART[kind].size
        if len(title) > LIMITS["title"]:
            self.notes.append(f"clipped {id}.title {LIMITS['title']}")
        self.cards.append(Card(
            id=id, kind=kind, ext=None if known else kind_name, topic=topic, title=_clip(title, LIMITS["title"]),
            w=min(max(w, 1), LIMITS["size"]), h=min(max(h, 1), LIMITS["size"]),
        ))

    def _set(self, id: str, name: str, value: str, agent: bool) -> None:
        c = self._card(id)
        limit = _field_limit(c.kind, name)
        if limit is None:
            raise Reject("unknown-field", f"{c.kind_name} has no field '{name}'")
        if c.kind == "record" and name != "title" and name not in c.fields and len(c.fields) >= LIMITS["record_fields"]:
            raise Reject("limit", f"card '{id}' already has {LIMITS['record_fields']} fields")
        # The user's answers are the user's: an agent does not write them.
        if agent and ((c.kind == "decision" and name == "chosen") or (c.kind == "input" and name == "sent")):
            raise Reject("user-only", f"'{name}' is the user's answer; it is set when the user picks or sends, never by an agent")
        if c.kind == "input" and name == "sent" and value != "yes":
            raise Reject("bad-value", f"input.sent is yes (got '{value}')")
        where = (c.kind, name)
        what = None
        if where == ("status", "state") and value not in ("ok", "run", "wait", "fail", "idle"):
            what = "one of ok|run|wait|fail|idle"
        elif where == ("progress", "pct") and not (_PCT_RE.fullmatch(value) and int(value) <= 100):
            what = "a whole number from 0 to 100"
        elif where == ("decision", "multi") and value not in ("yes", "no"):
            what = "yes or no"
        elif where == ("decision", "tone") and value not in ("normal", "danger"):
            what = "normal or danger"
        if what:
            raise Reject("bad-value", f"{c.kind}.{name} is {what} (got '{value}')")
        if len(value) > limit:
            self.notes.append(f"clipped {id}.{name} {limit}")
        v = _clip(value, limit)
        if name == "title":
            c.title = v
        else:
            c.fields[name] = v
        c.rev += 1

    def _del(self, id: str, item: Optional[str]) -> None:
        if item is not None:
            c = self._card(id)
            slot = c.item(item)
            if slot is None:
                raise Reject("no-such-item", f"card '{id}' has no item '{item}'")
            c.items.remove(slot)
            c.rev += 1
            return
        if self.card(id):
            self.cards = [c for c in self.cards if c.id != id]
        elif self.topic(id):
            if any(c.topic == id for c in self.cards):
                raise Reject("not-empty", f"topic '{id}' still has cards")
            self.topics = [t for t in self.topics if t.id != id]
        elif self.group(id):
            self.groups = [g for g in self.groups if g.id != id]
            for t in self.topics:
                if t.group == id:
                    t.group = None
        else:
            raise Reject("not-found", f"nothing has the id '{id}'")
        if self.focus == id:
            self.focus = None

    def _put_item(self, id: str, item: str, cells: List[str], update: bool, agent: bool) -> None:
        c = self._card(id)
        if _PART[c.kind].items == "":
            raise Reject("no-items", f"{c.kind_name} takes no items")
        if not valid_id(item):
            raise Reject("bad-id", f"item id '{item}' is not valid {_ID}")
        if not cells or len(cells) > LIMITS["cells"]:
            raise Reject("cell-count", f"an item has 1 to {LIMITS['cells']} cells")
        # The third cell of an input box is what the user typed. An agent writes the name and the hint only.
        if agent and c.kind == "input" and len(cells) > 2:
            raise Reject("user-only", "the third cell of an input box is the user's value; write 'box name | hint or kind' only")
        states = {"checklist": ("done", "todo"), "progress": ("done", "run", "todo", "fail")}.get(c.kind)
        if states and cells[0] not in states:
            raise Reject("bad-value", f"the first cell of a {c.kind} item is one of {'|'.join(states)} (got '{cells[0]}')")
        if c.kind == "route":
            # Two numbers joined by the first comma: what follows a second comma belongs to the second number, and fails.
            a, comma, b = (cells[1] if len(cells) > 1 else "").partition(",")
            if not comma or not _number(a) or not _number(b):
                raise Reject("bad-value", "a route item is 'name | lat,lon | distance and time to the next stop (optional)'; the second cell must be two numbers")
        if c.kind == "draw" and cells[0] not in ("line", "arrow", "rect", "circle", "text"):
            raise Reject("bad-value", f"the first cell of a draw item is one of line|arrow|rect|circle|text (got '{cells[0]}')")
        if c.kind == "chart" and (len(cells) < 2 or not _number(cells[1].replace(",", ""))):
            raise Reject("bad-value", "a chart item is 'name | number'")
        clipped = [_clip(x, LIMITS["cell"]) for x in cells]
        slot = c.item(item)
        if slot:
            slot.cells = clipped  # add on an existing id overwrites
        else:
            if update:
                raise Reject("no-such-item", f"card '{id}' has no item '{item}'; add it with add")
            limit = LIMITS["draw_items"] if c.kind == "draw" else LIMITS["items"]
            if len(c.items) >= limit:
                raise Reject("limit", f"card '{id}' already has {limit} items")
            c.items.append(Item(item, clipped))
        if clipped != cells:  # noted only once the op is applied: a rejected op leaves no note behind
            self.notes.append(f"clipped {id}.{item} {LIMITS['cell']}")
        c.rev += 1


def serialize(b: Board, topic: Optional[str] = None) -> str:
    """Write the board as ops. Applying them to an empty board with author ``restore`` gives the same board.

    With ``topic``, only that topic and its cards are written.
    """
    out: List[str] = []
    if topic is None:
        out += [f"let {name} {b.vars[name]}" for name in sorted(b.vars)]
        out += [f"group {g.id} {g.name}" for g in b.groups]
    for t in b.topics:
        if topic is not None and t.id != topic:
            continue
        out.append(f"topic {t.id} {t.name}")
        if topic is None and t.group is not None:
            out.append(f"put {t.id} {t.group}")
    for c in b.cards:
        if topic is not None and c.topic != topic:
            continue
        out.append(f"card {c.id} {c.kind_name} {c.topic} {c.w}x{c.h} {c.title}")
        out += [f"set {c.id} {f} {c.fields[f]}" for f in sorted(c.fields)]
        out += [f"add {c.id} {i.id} {join_cells(i.cells)}" for i in c.items]
        if c.grid:
            out.append(f"move {c.id} {c.grid[0]} {c.grid[1]}")
        if c.pinned:
            out.append(f"pin {c.id}")
    return "".join(line + "\n" for line in out)
