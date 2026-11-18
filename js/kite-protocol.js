// KITE Protocol 0.3 in JavaScript: the board, the parser and the serializer. No dependencies.
// A port of the reference implementation (protocol/rust); it runs the same conformance cases (test.mjs).
//
//   import { Board, parse, serialize } from "./kite-protocol.js";
//   const board = new Board();
//   const verdict = board.line("card k1 metric trip 2x2 Days left");   // "ok" | "ok clipped ..." | "err <code> <message>" | "skip"
//   serialize(board);                                                  // the board as ops

export const VERSION = "0.3";

/** Why an op was not applied: a stable code for programs, an English message for whoever wrote the line. */
export class Reject extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
  /** The verdict as the protocol writes it. */
  get line() {
    return `${this.code} ${this.message}`;
  }
}
const no = (code, message) => new Reject(code, message);

const ID = "(1 to 24 letters, digits, _ or -)";
export const LIMITS = { id: 24, title: 40, topic: 24, group: 16, cell: 60, cells: 6, items: 24, drawItems: 80, groups: 8, vars: 64, say: 80, size: 8, recordField: 80, recordFields: 12 };

/** The card types: name, default size, fields with limits (an empty description marks a field the renderer sets), item shape. */
export const PARTS = [
  { name: "status", size: [2, 1], purpose: "one state", fields: [["state", 8, "state: ok/run/wait/fail/idle"], ["text", 80, "text(80)"]], items: "" },
  { name: "metric", size: [2, 2], purpose: "one number", fields: [["value", 14, "value(14)"], ["unit", 8, "unit(8)"], ["delta", 14, "delta(14, colored when it starts with + or -)"], ["text", 60, "text(60)"]], items: "" },
  { name: "chart", size: [4, 3], purpose: "quantities as a picture: comparison (bar), change over time (line), shares (donut)", fields: [["unit", 8, "unit(8)"], ["form", 8, "form: bar(default)/line/donut"]], items: "name | number" },
  { name: "route", size: [6, 5], purpose: "a route: where the stops are, the shape of the way, distance and time per leg", fields: [["total", 40, "total(whole distance and time, 40)"], ["text", 80, "text(80)"]], items: "name | lat,lon | distance and time to the next stop" },
  { name: "draw", size: [5, 4], purpose: "a drawing no other type can show: structure, flow, seating, relations", fields: [["text", 80, "text(80)"]], items: "shape | coordinates | text | color | size" },
  { name: "image", size: [4, 3], purpose: "a picture file or picture address shown as it is: a photo, a capture, a generated image", fields: [["src", 600, "src: absolute path of a picture file, or the web address of a picture"], ["text", 80, "text(caption, 80)"]], items: "" },
  { name: "table", size: [4, 3], purpose: "a comparison or a list with several attributes", fields: [["cols", 200, "cols: column | column ..."]], items: "cell | cell ... (up to 6 cells)" },
  { name: "progress", size: [3, 3], purpose: "work in progress", fields: [["pct", 3, "pct(0-100)"], ["text", 60, "text(60)"]], items: "done/run/todo/fail | step name" },
  { name: "checklist", size: [3, 3], purpose: "things to do (the user can tick them)", fields: [], items: "done/todo | text" },
  { name: "decision", size: [3, 3], purpose: "something the user has to decide (pick one)", fields: [["text", 120, "text(the question, 120)"], ["multi", 8, "multi: yes when several may be picked"], ["tone", 8, "tone: danger when the choice cannot be undone"], ["chosen", 120, ""]], items: "option name | one-line description" },
  { name: "input", size: [3, 3], purpose: "values the user has to give (fill in): a date, a name, a number, an address", fields: [["text", 120, "text(what is asked and why, 120)"], ["sent", 8, ""]], items: "box name (end it with * when it must be filled) | hint (an example) or the kind of box: date / time / number / slider 0~100 unit / choice A / B / C" },
  { name: "timeline", size: [3, 3], purpose: "things in order of time", fields: [], items: "when | text | done/run/todo (optional)" },
  { name: "note", size: [3, 2], purpose: "a short text that fits none of the above", fields: [["text", 240, "text(240)"]], items: "" },
  { name: "web", size: [6, 5], purpose: "a web page or an HTML file shown as it is, in a small browser", fields: [["url", 600, "url: a web address, or the absolute path of a file on this computer"]], items: "" },
  { name: "record", size: [3, 3], purpose: "one thing with named properties that no other type fits: an invoice, a contact, a ticket, a setting", fields: [["text", 240, "any field name of your choosing, shown as label and value (80 each, up to 12), text(240)"], ["cols", 200, "cols: column | column ... (when it has rows)"]], items: "cell | cell ... (up to 6 cells, optional)" },
  { name: "doc", size: [3, 2], purpose: "a document, file or link that is too long for the board: shown by name with a summary, opened by the user", fields: [["src", 600, "src: absolute path of the file, or a web address"], ["text", 240, "text(what it is and what it says, 240)"]], items: "" },
];
const PART = new Map(PARTS.map((p) => [p.name, p]));

export const kindNames = () => PARTS.map((p) => p.name);

/** The card type table for a model (Markdown), the same text the reference implementation builds. */
export function partsTable() {
  let t = "| Type | Use | Fields (length limit) | Item | Default size |\n|---|---|---|---|---|\n";
  const cell = (s) => (s === "" ? "none" : s.replaceAll("|", "\\|"));
  for (const p of PARTS) {
    const fields = p.fields.map((f) => f[2]).filter((d) => d !== "");
    t += `| ${p.name} | ${p.purpose} | ${cell(fields.join(", "))} | ${cell(p.items)} | ${p.size[0]}x${p.size[1]} |\n`;
  }
  return t;
}

// Lengths are counted in Unicode scalar values, as the specification says.
const chars = (s) => [...s].length;
function clip(s, limit) {
  if (chars(s) <= limit) return s;
  return [...s].slice(0, Math.max(0, limit - 1)).join("") + "…";
}
export const validId = (id) => id !== "" && chars(id) <= LIMITS.id && /^[\p{L}\p{N}_-]+$/u.test(id);
export const isExtensionKind = (name) => name.startsWith("x-") && validId(name.slice(2)) && chars(name) <= LIMITS.id;
export const asks = (kind) => kind === "decision" || kind === "input";

function fieldLimit(kind, field) {
  if (field === "title") return LIMITS.title;
  const f = PART.get(kind).fields.find((x) => x[0] === field);
  if (f) return f[1];
  return kind === "record" && validId(field) ? LIMITS.recordField : null;
}

// ---------------------------------------------------------------- the line language

function split1(s) {
  s = s.replace(/^\s+/u, "");
  const m = /\s/u.exec(s);
  return m ? [s.slice(0, m.index), s.slice(m.index).replace(/^\s+/u, "")] : [s, ""];
}
function need(s, usage) {
  if (s === "") throw no("missing-argument", `expected: ${usage}`);
  return s;
}
function parseSize(s) {
  const m = /^(\d+)[xX](\d+)$/.exec(s);
  if (!m) return null;
  const [w, h] = [Number(m[1]), Number(m[2])];
  return w <= 255 && h <= 255 ? [w, h] : null;
}
const int = (s) => (/^[+-]?\d+$/.test(s) ? Number(s) : null);

/** Split a value into cells at `|`. Inside a cell, `\|` is a `|` that does not split. */
export function splitCells(rest) {
  const out = [];
  let cur = "";
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === "\\" && rest[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (c === "|") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}
/** Write cells back as one value: joined by ` | `, a `|` inside a cell written as `\|`. */
export const joinCells = (cells) => cells.map((c) => c.replaceAll("|", "\\|")).join(" | ");

export const isBlank = (line) => {
  line = line.trim();
  return line === "" || line.startsWith("#") || line.startsWith("```");
};

/** Parse one line into an op. Blank lines, comments, code fences and `tell` are null. Throws Reject. */
export function parse(raw) {
  const line = raw.trim();
  if (isBlank(line)) return null;
  const [cmd, rest] = split1(line);
  switch (cmd) {
    case "topic": {
      const [id, name] = split1(rest);
      return { op: "topic", id: need(id, "topic <id> <name>"), name };
    }
    case "group": {
      const [id, name] = split1(rest);
      return { op: "group", id: need(id, "group <id> <name>"), name };
    }
    case "mv": {
      const [card, topic] = split1(rest);
      return { op: "mv", card: need(card, "mv <card> <topic>"), topic: need(topic, "mv <card> <topic>") };
    }
    case "put": {
      const [topic, group] = split1(rest);
      return { op: "put", topic: need(topic, "put <topic> <group>"), group: need(group, "put <topic> <group>") };
    }
    case "card": {
      const [id, r1] = split1(rest);
      const [kind, r2] = split1(r1);
      const [topic, r3] = split1(r2);
      need(topic, "card <id> <kind> <topic> [<w>x<h>] <title>");
      const [maybe, after] = split1(r3);
      const size = parseSize(maybe);
      return { op: "card", id, kind, topic, size, title: size ? after : r3 };
    }
    case "set": {
      const [id, r1] = split1(rest);
      const [field, value] = split1(r1);
      return { op: "set", id, field: need(field, "set <id> <field> <value>"), value };
    }
    case "add":
    case "upd": {
      const usage = `${cmd} <id> <item> <cell> | <cell> ...`;
      const [id, r1] = split1(rest);
      const [item, r2] = split1(r1);
      need(item, usage);
      return { op: cmd, id, item, cells: splitCells(need(r2, usage)) };
    }
    case "del": {
      const [id, item] = split1(rest);
      return { op: "del", id: need(id, "del <id> [<item>]"), item: item === "" ? null : item };
    }
    case "size": {
      const [id, s] = split1(rest);
      const size = parseSize(s);
      if (!size) throw no("bad-syntax", "expected: size <id> <w>x<h>");
      return { op: "size", id, w: size[0], h: size[1] };
    }
    case "move": {
      const [id, r1] = split1(rest);
      const [c, r] = split1(r1);
      const [col, row] = [int(c), int(r)];
      if (col === null || row === null) throw no("bad-syntax", "expected: move <id> <col> <row>");
      return { op: "move", id, col, row };
    }
    case "let": {
      const [name, value] = split1(rest);
      return { op: "let", name: need(name, "let <name> <value>"), value };
    }
    case "archive":
      return { op: "archive", topic: need(rest, "archive <topic>") };
    case "restore":
      return { op: "restore", topic: need(rest, "restore <topic>") };
    case "pin":
    case "unpin":
      return { op: "pin", id: need(rest, "pin <id>"), on: cmd === "pin" };
    case "focus":
      return { op: "focus", id: need(rest, "focus <id>") };
    case "say":
      return { op: "say", text: rest };
    case "tell":
      return null; // read aloud by a renderer with a voice; changes no board
    default:
      throw no("unknown-verb", `unknown verb '${cmd}'`);
  }
}

// ---------------------------------------------------------------- the board

export class Board {
  constructor() {
    this.groups = []; // { id, name }
    this.topics = []; // { id, name, group }
    this.cards = []; // { id, kind, ext, topic, title, fields: Map, items: [{ id, cells }], w, h, grid, pinned, rev }
    this.shelf = []; // { topic, cards }
    this.vars = new Map();
    this.say = "";
    this.focus = null;
    /** Notes about ops applied with a change: `clipped <what> <limit>`. Whoever relays verdicts drains this. */
    this.notes = [];
  }

  card(id) {
    return this.cards.find((c) => c.id === id) ?? null;
  }
  #card(id) {
    const c = this.card(id);
    if (!c) throw no("no-such-card", `no card '${id}'`);
    return c;
  }

  /** Parse and apply one line. Returns the verdict: `skip`, `ok`, `ok clipped ...` or `err <code> <message>`. */
  line(raw, by = "agent") {
    try {
      const op = parse(raw);
      if (!op) return "skip";
      this.apply(op, by);
      const notes = this.notes.splice(0);
      return notes.length ? `ok ${notes.join("; ")}` : "ok";
    } catch (e) {
      if (e instanceof Reject) return `err ${e.line}`;
      throw e;
    }
  }

  /** Show `{name}` in a text as the named value. */
  show(s) {
    if (this.vars.size === 0 || !s.includes("{")) return s;
    return s.replace(/\{([^{}\s]+)\}/gu, (m, name) => this.vars.get(name) ?? m);
  }

  /** Check one op and apply it. Throws Reject; a rejected op changes nothing. `by` is "agent" or "user". */
  apply(op, by = "agent") {
    const agent = by !== "user";
    switch (op.op) {
      case "topic": {
        if (!validId(op.id)) throw no("bad-id", `topic id '${op.id}' is not valid ${ID}`);
        if (this.shelf.some((s) => s.topic.id === op.id)) throw no("shelved", `topic '${op.id}' is on the shelf; bring it back with: restore ${op.id}`);
        const name = clip(op.name === "" ? op.id : op.name, LIMITS.topic);
        const t = this.topics.find((x) => x.id === op.id);
        if (t) t.name = name;
        else this.topics.push({ id: op.id, name, group: null });
        return;
      }
      case "group": {
        if (!validId(op.id)) throw no("bad-id", `group id '${op.id}' is not valid ${ID}`);
        if (this.topics.some((t) => t.id === op.id) || this.card(op.id)) throw no("id-in-use", `'${op.id}' is already the id of a topic or a card`);
        const name = clip(op.name === "" ? op.id : op.name, LIMITS.group);
        const g = this.groups.find((x) => x.id === op.id);
        if (g) g.name = name;
        else {
          if (this.groups.length >= LIMITS.groups) throw no("limit", `at most ${LIMITS.groups} groups; make the groups broader`);
          this.groups.push({ id: op.id, name });
        }
        return;
      }
      case "mv": {
        if (!this.topics.some((t) => t.id === op.topic)) throw no("no-such-topic", `no topic '${op.topic}'`);
        const c = this.#card(op.card);
        c.topic = op.topic;
        c.grid = null;
        c.pinned = false;
        c.rev++;
        return;
      }
      case "put": {
        if (!this.groups.some((g) => g.id === op.group)) throw no("no-such-group", `no group '${op.group}'; create it first with: group ${op.group} <name>`);
        const t = this.topics.find((x) => x.id === op.topic);
        if (!t) throw no("no-such-topic", `no topic '${op.topic}'`);
        t.group = op.group;
        return;
      }
      case "card": {
        if (this.shelf.some((s) => s.cards.some((c) => c.id === op.id))) throw no("shelved", `card id '${op.id}' belongs to a card on the shelf; use another id`);
        if (!validId(op.id)) throw no("bad-id", `card id '${op.id}' is not valid ${ID}`);
        if (this.card(op.id)) throw no("exists", `card '${op.id}' already exists; change it with set/add/upd instead of creating it again`);
        const known = PART.has(op.kind);
        if (!known && !isExtensionKind(op.kind)) throw no("unknown-kind", `no card type '${op.kind}'`);
        const kind = known ? op.kind : "record";
        if (!this.topics.some((t) => t.id === op.topic)) throw no("no-such-topic", `no topic '${op.topic}'; create it first with: topic ${op.topic} <name>`);
        const [w, h] = op.size ?? PART.get(kind).size;
        if (chars(op.title) > LIMITS.title) this.notes.push(`clipped ${op.id}.title ${LIMITS.title}`);
        const clamp = (n) => Math.min(Math.max(n, 1), LIMITS.size);
        this.cards.push({ id: op.id, kind, ext: known ? null : op.kind, topic: op.topic, title: clip(op.title, LIMITS.title), fields: new Map(), items: [], w: clamp(w), h: clamp(h), grid: null, pinned: false, rev: 1 });
        return;
      }
      case "set": {
        const c = this.#card(op.id);
        const limit = fieldLimit(c.kind, op.field);
        if (limit === null) throw no("unknown-field", `${c.ext ?? c.kind} has no field '${op.field}'`);
        if (c.kind === "record" && op.field !== "title" && !c.fields.has(op.field) && c.fields.size >= LIMITS.recordFields) throw no("limit", `card '${op.id}' already has ${LIMITS.recordFields} fields`);
        // The user's answers are the user's: an agent does not write them.
        if (agent && ((c.kind === "decision" && op.field === "chosen") || (c.kind === "input" && op.field === "sent"))) throw no("user-only", `'${op.field}' is the user's answer; it is set when the user picks or sends, never by an agent`);
        if (c.kind === "input" && op.field === "sent" && op.value !== "yes") throw no("bad-value", `input.sent is yes (got '${op.value}')`);
        const check = (kind, field, ok, what) => {
          if (c.kind === kind && op.field === field && !ok) throw no("bad-value", `${kind}.${field} is ${what} (got '${op.value}')`);
        };
        check("status", "state", ["ok", "run", "wait", "fail", "idle"].includes(op.value), "one of ok|run|wait|fail|idle");
        check("progress", "pct", /^\+?\d+$/.test(op.value) && Number(op.value) <= 100, "a whole number from 0 to 100");
        check("decision", "multi", ["yes", "no"].includes(op.value), "yes or no");
        check("decision", "tone", ["normal", "danger"].includes(op.value), "normal or danger");
        if (chars(op.value) > limit) this.notes.push(`clipped ${op.id}.${op.field} ${limit}`);
        const v = clip(op.value, limit);
        if (op.field === "title") c.title = v;
        else c.fields.set(op.field, v);
        c.rev++;
        return;
      }
      case "add":
      case "upd":
        return this.#putItem(op.id, op.item, op.cells, op.op === "upd", agent);
      case "del": {
        if (op.item !== null) {
          const c = this.#card(op.id);
          const at = c.items.findIndex((i) => i.id === op.item);
          if (at < 0) throw no("no-such-item", `card '${op.id}' has no item '${op.item}'`);
          c.items.splice(at, 1);
          c.rev++;
          return;
        }
        const at = this.cards.findIndex((c) => c.id === op.id);
        if (at >= 0) this.cards.splice(at, 1);
        else if (this.topics.some((t) => t.id === op.id)) {
          if (this.cards.some((c) => c.topic === op.id)) throw no("not-empty", `topic '${op.id}' still has cards`);
          this.topics = this.topics.filter((t) => t.id !== op.id);
        } else if (this.groups.some((g) => g.id === op.id)) {
          this.groups = this.groups.filter((g) => g.id !== op.id);
          for (const t of this.topics) if (t.group === op.id) t.group = null;
        } else throw no("not-found", `nothing has the id '${op.id}'`);
        if (this.focus === op.id) this.focus = null;
        return;
      }
      case "size": {
        const c = this.#card(op.id);
        if (agent && c.pinned) throw no("pinned", `the user pinned '${op.id}'; its size cannot be changed`);
        c.w = Math.min(Math.max(op.w, 1), LIMITS.size);
        c.h = Math.min(Math.max(op.h, 1), LIMITS.size);
        if (!agent) c.pinned = true;
        c.rev++;
        return;
      }
      case "move": {
        const c = this.#card(op.id);
        if (agent && c.pinned) throw no("pinned", `the user pinned '${op.id}'; it cannot be moved`);
        c.grid = [Math.max(op.col, 0), Math.max(op.row, 0)];
        if (!agent) c.pinned = true;
        return;
      }
      case "pin": {
        if (agent) throw no("user-only", "only the user can pin or unpin");
        const c = this.#card(op.id);
        c.pinned = op.on;
        if (!op.on) c.grid = null;
        return;
      }
      case "focus":
        this.#card(op.id);
        this.focus = op.id;
        return;
      case "let": {
        if (!validId(op.name)) throw no("bad-id", `value name '${op.name}' is not valid ${ID}`);
        if (op.value.trim() === "") {
          this.vars.delete(op.name);
          return;
        }
        if (!this.vars.has(op.name) && this.vars.size >= LIMITS.vars) throw no("limit", `at most ${LIMITS.vars} named values`);
        if (chars(op.value) > LIMITS.cell) this.notes.push(`clipped let.${op.name} ${LIMITS.cell}`);
        this.vars.set(op.name, clip(op.value.trim(), LIMITS.cell));
        return;
      }
      case "archive": {
        const t = this.topics.find((x) => x.id === op.topic);
        if (!t) throw no("no-such-topic", `no topic '${op.topic}'`);
        this.topics = this.topics.filter((x) => x !== t);
        const gone = this.cards.filter((c) => c.topic === op.topic);
        this.cards = this.cards.filter((c) => c.topic !== op.topic);
        if (gone.some((c) => c.id === this.focus)) this.focus = null;
        this.shelf.push({ topic: t, cards: gone });
        return;
      }
      case "restore": {
        const s = this.shelf.find((x) => x.topic.id === op.topic);
        if (!s) throw no("not-shelved", `no topic '${op.topic}' on the shelf`);
        this.shelf = this.shelf.filter((x) => x !== s);
        if (s.topic.group !== null && !this.groups.some((g) => g.id === s.topic.group)) s.topic.group = null;
        this.topics.push(s.topic);
        for (const c of s.cards) {
          c.rev++;
          this.cards.push(c);
        }
        return;
      }
      case "say":
        if (chars(op.text) > LIMITS.say) this.notes.push(`clipped say ${LIMITS.say}`);
        this.say = clip(op.text, LIMITS.say);
        return;
      default:
        throw no("unknown-verb", `unknown op '${op.op}'`);
    }
  }

  #putItem(id, item, cells, update, agent) {
    const c = this.#card(id);
    const name = c.ext ?? c.kind;
    if (PART.get(c.kind).items === "") throw no("no-items", `${name} takes no items`);
    if (!validId(item)) throw no("bad-id", `item id '${item}' is not valid ${ID}`);
    if (cells.length === 0 || cells.length > LIMITS.cells) throw no("cell-count", `an item has 1 to ${LIMITS.cells} cells`);
    // The third cell of an input box is what the user typed. An agent writes the name and the hint only.
    if (agent && c.kind === "input" && cells.length > 2) throw no("user-only", "the third cell of an input box is the user's value; write 'box name | hint or kind' only");
    const states = c.kind === "checklist" ? ["done", "todo"] : c.kind === "progress" ? ["done", "run", "todo", "fail"] : [];
    if (states.length && !states.includes(cells[0])) throw no("bad-value", `the first cell of a ${c.kind} item is one of ${states.join("|")} (got '${cells[0]}')`);
    const number = (s) => s.trim() !== "" && Number.isFinite(Number(s.trim()));
    if (c.kind === "route") {
      const p = (cells[1] ?? "").split(",");
      // Two numbers joined by the first comma: what follows a second comma belongs to the second number, and fails.
      const [a, b] = [p[0], p.slice(1).join(",")];
      if (p.length < 2 || !number(a) || !number(b)) throw no("bad-value", "a route item is 'name | lat,lon | distance and time to the next stop (optional)'; the second cell must be two numbers");
    }
    if (c.kind === "draw" && !["line", "arrow", "rect", "circle", "text"].includes(cells[0])) throw no("bad-value", `the first cell of a draw item is one of line|arrow|rect|circle|text (got '${cells[0]}')`);
    if (c.kind === "chart" && (cells[1] === undefined || !number(cells[1].replaceAll(",", "")))) throw no("bad-value", "a chart item is 'name | number'");
    if (cells.some((x) => chars(x) > LIMITS.cell)) this.notes.push(`clipped ${id}.${item} ${LIMITS.cell}`);
    const clipped = cells.map((x) => clip(x, LIMITS.cell));
    const slot = c.items.find((i) => i.id === item);
    if (slot) slot.cells = clipped; // add on an existing id overwrites
    else {
      if (update) throw no("no-such-item", `card '${id}' has no item '${item}'; add it with add`);
      const limit = c.kind === "draw" ? LIMITS.drawItems : LIMITS.items;
      if (c.items.length >= limit) throw no("limit", `card '${id}' already has ${limit} items`);
      c.items.push({ id: item, cells: clipped });
    }
    c.rev++;
  }
}

/** Write the board as ops. Applying them to an empty board with author `user` gives the same board. */
export function serialize(b, topic = null) {
  let s = "";
  const sorted = (m) => [...m.entries()].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  if (topic === null) {
    for (const [name, value] of sorted(b.vars)) s += `let ${name} ${value}\n`;
    for (const g of b.groups) s += `group ${g.id} ${g.name}\n`;
  }
  for (const t of b.topics) {
    if (topic !== null && t.id !== topic) continue;
    s += `topic ${t.id} ${t.name}\n`;
    if (topic === null && t.group !== null) s += `put ${t.id} ${t.group}\n`;
  }
  for (const c of b.cards) {
    if (topic !== null && c.topic !== topic) continue;
    s += `card ${c.id} ${c.ext ?? c.kind} ${c.topic} ${c.w}x${c.h} ${c.title}\n`;
    for (const [f, v] of sorted(c.fields)) s += `set ${c.id} ${f} ${v}\n`;
    for (const i of c.items) s += `add ${c.id} ${i.id} ${joinCells(i.cells)}\n`;
    if (c.grid) s += `move ${c.id} ${c.grid[0]} ${c.grid[1]}\n`;
    if (c.pinned) s += `pin ${c.id}\n`;
  }
  return s;
}

/** Cuts a stream of text into lines: `feed` returns the lines that ended, `partial` is the line still arriving. */
export class LineStream {
  constructor() {
    this.partial = "";
  }
  feed(delta) {
    this.partial += delta;
    const out = [];
    let i;
    while ((i = this.partial.indexOf("\n")) >= 0) {
      out.push(this.partial.slice(0, i).trimEnd());
      this.partial = this.partial.slice(i + 1);
    }
    return out;
  }
  finish() {
    const rest = this.partial;
    this.partial = "";
    return rest.trim() === "" ? null : rest;
  }
}
