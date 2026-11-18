// <patet-board>: a PATET renderer for the web, as one custom element with no dependencies.
//
//   <script type="module" src="patet-board.js"></script>
//   <patet-board id="board"></patet-board>
//
//   board.apply("card k1 metric trip 2x2 Days left")   -> "ok" | "ok clipped ..." | "err <code> <message>" | "skip"
//   board.feed(chunk); board.end()                      a model's text as it streams
//   board.read()                                        the board as ops, to show a model before it edits
//   board.describe()                                    what this renderer supports (SPEC.md section 6)
//   board.addEventListener("patet-event", e => e.detail.entry)   "user set k2 chosen o2", to send to your agent
//
// Attributes: `media` lets writers create web, image and doc cards (off by default: they load what the writer
// chose); `theme="light"` or `theme="dark"` overrides the system setting.
// Every text a writer sends is put on the page as text, never as HTML.

import { Board, LineStream, VERSION, asks, joinCells, kindNames, parse, serialize, splitCells } from "../js/patet.js";

const MEDIA = ["web", "image", "doc"];
const SVG = "http://www.w3.org/2000/svg";

/** Make an element: h("div", { class: "x", text: "hi", onclick }, child, ...). */
function h(tag, props = {}, ...kids) {
  const svg = ["svg", "path", "circle", "rect", "line", "polyline", "text", "g", "defs", "marker"].includes(tag);
  const e = svg ? document.createElementNS(SVG, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid) e.append(kid);
  return e;
}

const STYLE = `
:host { --bg:#0f1012; --panel:#16171a; --card:#1c1d21; --raised:#25262b; --line:#2e3036; --edge:#4a4d55; --text:#ececee; --soft:#c9cacf; --dim:#8f9198; --faint:#63656c;
  --accent:#f0932b; --green:#4cc38a; --red:#e5605a; --amber:#e0a93b; --on:#ececee; --on-text:#16171a;
  display:block; background:var(--bg); color:var(--text); font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans KR",sans-serif; }
:host([theme="light"]) { --bg:#f3f3f1; --panel:#fafaf8; --card:#ffffff; --raised:#f0f0ee; --line:#e2e2df; --edge:#b9b9b4; --text:#1b1c1e; --soft:#3a3b3f; --dim:#74767c; --faint:#a0a2a8; --on:#1b1c1e; --on-text:#ffffff; }
@media (prefers-color-scheme: light) { :host(:not([theme="dark"])) { --bg:#f3f3f1; --panel:#fafaf8; --card:#ffffff; --raised:#f0f0ee; --line:#e2e2df; --edge:#b9b9b4; --text:#1b1c1e; --soft:#3a3b3f; --dim:#74767c; --faint:#a0a2a8; --on:#1b1c1e; --on-text:#ffffff; } }
* { box-sizing:border-box; }
.wrap { display:grid; grid-template-columns:minmax(260px,320px) 1fr; gap:18px; padding:18px; align-items:start; }
.wrap.solo { grid-template-columns:1fr; }
@media (max-width:760px) { .wrap { grid-template-columns:1fr; } }
aside { background:var(--panel); border:1px solid var(--line); border-radius:22px; padding:16px; position:sticky; top:12px; }
.turn { display:flex; align-items:center; gap:8px; font-weight:700; margin-bottom:10px; }
.turn i { width:8px; height:8px; border-radius:50%; background:var(--accent); }
.turn small { color:var(--accent); font-weight:600; }
.say { font-weight:700; } .card + .say { margin-top:14px; padding-top:12px; border-top:1px solid var(--line); }
.say:empty { display:none; }
.group { color:var(--dim); font-size:12px; letter-spacing:.06em; text-transform:uppercase; margin:6px 4px 8px; }
section { border:1px solid var(--line); border-radius:24px; padding:12px; margin-bottom:16px; }
section > h2 { font-size:14px; margin:4px 8px 10px; color:var(--soft); }
section > h2 small { color:var(--faint); font-weight:400; margin-left:6px; }
.grid { display:grid; grid-template-columns:repeat(var(--cols,12),minmax(0,1fr)); grid-auto-rows:minmax(72px,auto); gap:12px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:16px; min-width:0; overflow:hidden; grid-column:span var(--w); grid-row:span var(--h); }
.card.focus { border-color:var(--edge); }
aside .card { border:1px solid var(--edge); }
.card > h3 { font-size:16px; margin:0 0 10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.card > h3 small { float:right; color:var(--accent); font-size:11px; font-weight:400; margin-top:4px; }
p { margin:0 0 8px; color:var(--soft); white-space:pre-wrap; overflow-wrap:anywhere; }
.dim { color:var(--dim); } .faint { color:var(--faint); font-size:12px; }
.row { display:flex; align-items:center; gap:10px; padding:5px 0; min-width:0; }
.row > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dot { flex:none; width:12px; height:12px; border-radius:50%; border:1.5px solid var(--faint); }
.dot.ok,.dot.done { background:var(--green); border-color:var(--green); } .dot.run { background:var(--text); border-color:var(--text); }
.dot.wait { border-color:var(--amber); } .dot.fail { background:var(--red); border-color:var(--red); }
.big { font-size:40px; font-weight:800; line-height:1.1; overflow-wrap:anywhere; } .big.long { font-size:26px; } .unit { color:var(--dim); margin-left:6px; font-weight:600; }
.delta.up { color:var(--green); } .delta.down { color:var(--red); }
.rows { overflow-x:auto; } table { width:100%; border-collapse:collapse; } th { text-align:left; color:var(--faint); font-size:11px; font-weight:400; padding:0 12px 6px 0; }
td { padding:6px 14px 6px 0; color:var(--dim); vertical-align:top; min-width:5.5em; } td:first-child, th { white-space:nowrap; } td:first-child { color:var(--text); font-weight:700; }
.kv { display:grid; grid-template-columns:auto 1fr; gap:4px 14px; margin-bottom:8px; } .kv span:nth-child(odd) { color:var(--faint); font-size:12px; align-self:center; } .kv span:nth-child(even) { font-weight:700; overflow-wrap:anywhere; }
.bar { height:6px; border-radius:3px; background:var(--raised); overflow:hidden; flex:1; } .bar > i { display:block; height:100%; background:var(--soft); border-radius:3px; }
.check { flex:none; width:20px; height:20px; border-radius:6px; border:1.5px solid var(--faint); background:none; cursor:pointer; padding:0; }
.check.done { background:var(--green); border-color:var(--green); }
button.opt { display:block; width:100%; text-align:left; background:var(--card); color:var(--text); border:1px solid var(--line); border-radius:16px; padding:10px 14px; margin-bottom:8px; cursor:pointer; font:inherit; }
button.opt:hover { background:var(--raised); border-color:var(--edge); } button.opt b { display:block; } button.opt span { color:var(--dim); font-size:12px; }
button.opt.on { background:var(--on); color:var(--on-text); border-color:var(--on); } button.opt.on span { color:var(--on-text); opacity:.7; }
.danger button.opt { border-color:color-mix(in srgb, var(--red) 45%, var(--line)); } .danger button.opt:hover { border-color:var(--red); }
button.go { float:right; background:var(--on); color:var(--on-text); border:0; border-radius:17px; padding:8px 20px; font:inherit; font-weight:700; cursor:pointer; }
button.go:disabled { background:var(--raised); color:var(--faint); cursor:default; }
label { display:block; color:var(--dim); font-size:12px; margin:8px 0 4px; }
input[type=text],input[type=number],input[type=date],input[type=time] { width:100%; background:var(--raised); color:var(--text); border:1px solid var(--line); border-radius:11px; padding:8px 12px; font:inherit; color-scheme:dark light; }
input[type=range] { width:100%; accent-color:var(--soft); }
.pill { display:inline-block; background:var(--card); color:var(--text); border:1px solid var(--line); border-radius:15px; padding:5px 13px; margin:0 6px 6px 0; cursor:pointer; font:inherit; font-weight:700; font-size:12.5px; }
.pill.on { background:var(--on); color:var(--on-text); border-color:var(--on); }
svg { display:block; width:100%; } svg text { fill:var(--soft); font:10px system-ui,sans-serif; }
.media { background:var(--raised); border-radius:10px; padding:18px; text-align:center; color:var(--faint); font-size:12px; }
img { max-width:100%; border-radius:10px; display:block; } iframe { width:100%; height:320px; border:0; border-radius:10px; background:#fff; }
a { color:var(--accent); }
.empty { color:var(--faint); padding:40px; text-align:center; }
.shelf { margin:4px 4px 0; color:var(--faint); font-size:12px; } .shelf button { margin-left:6px; }
`;

const COLORS = { accent: "var(--accent)", orange: "var(--accent)", green: "var(--green)", red: "var(--red)", amber: "var(--amber)", yellow: "var(--amber)", dim: "var(--dim)", gray: "var(--dim)", faint: "var(--faint)", white: "var(--text)" };

export class PatetBoard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.board = new Board();
    this.stream = new LineStream();
    /** What the user typed or marked and has not sent yet: "card:item" -> value. */
    this.drafts = new Map();
    this.shadowRoot.append(h("style", { text: STYLE }), h("div", { class: "wrap" }));
    /** Columns of the grid a topic lays its cards on: as many as fit at a readable width, 12 at most. */
    this.cols = 12;
    new ResizeObserver(() => this.#fit()).observe(this);
    this.#render();
  }

  static get observedAttributes() {
    return ["media"];
  }
  attributeChangedCallback() {
    this.#schedule();
  }

  /** May writers create web, image and doc cards? */
  get media() {
    return this.hasAttribute("media");
  }

  /** Apply one line. `by` is "agent" (the default) or "user". Returns the verdict. */
  apply(line, by = "agent") {
    if (by !== "user" && !this.media) {
      // Cards that load what the writer chose are refused unless the page allowed them.
      let op = null;
      try {
        op = parse(line);
      } catch {
        /* the board will say what is wrong with the line */
      }
      const loads = (kind) => MEDIA.includes(kind);
      if (op && ((op.op === "card" && loads(op.kind)) || (op.op === "set" && ["src", "url"].includes(op.field) && loads(this.board.card(op.id)?.kind)))) {
        return "err not-allowed this board does not let writers create web, image or doc cards";
      }
    }
    const verdict = this.board.line(line, by);
    if (verdict.startsWith("ok")) this.#schedule();
    return verdict;
  }

  /**
   * Apply several lines. Returns what was not simply applied: [{ line, verdict }]. The array also carries the
   * counts of this call as `applied`, `rejected` and `clipped`.
   */
  write(text, by = "agent") {
    const out = Object.assign([], { applied: 0, rejected: 0, clipped: 0 });
    for (const line of text.split("\n")) {
      const verdict = this.apply(line, by);
      if (verdict === "skip") continue;
      if (verdict.startsWith("err")) out.rejected++;
      else out.applied++;
      if (verdict.startsWith("ok clipped")) out.clipped++;
      if (verdict !== "ok") out.push({ line: line.trim(), verdict });
    }
    return out;
  }

  /** A piece of a model's text as it streams. Lines are applied as they end. Returns what was not simply applied. */
  feed(delta) {
    return this.stream.feed(delta).flatMap((line) => this.write(line));
  }
  /** The stream is over: apply a last line that had no line break. */
  end() {
    const rest = this.stream.finish();
    return rest ? this.write(rest) : [];
  }

  /** The board as ops (all of it, or one topic). */
  read(topic = null) {
    return serialize(this.board, topic);
  }

  /** What this renderer supports, one line per entry. */
  describe() {
    const kinds = kindNames().filter((k) => this.media || !MEDIA.includes(k));
    return [`patet ${VERSION}`, "renderer patet-board 0.1", `kinds ${kinds.join(" ")}`];
  }

  /** Remove everything. */
  clear() {
    this.board = new Board();
    this.stream = new LineStream();
    this.drafts.clear();
    this.#schedule();
  }

  // ------------------------------------------------------------ what the user does

  #user(...lines) {
    for (const line of lines) {
      if (this.apply(line, "user").startsWith("ok")) this.dispatchEvent(new CustomEvent("patet-event", { detail: { entry: `user ${line}` }, bubbles: true, composed: true }));
    }
  }

  // ------------------------------------------------------------ drawing

  // A card is `w` columns wide on a 12-column board. On a narrower one it takes what there is.
  #fit() {
    const width = this.clientWidth;
    if (!width) return;
    const beside = this.shadowRoot.querySelector("aside") && width > 760 ? 338 : 0;
    const cols = Math.min(12, Math.max(2, Math.floor((width - beside - 60) / 104)));
    if (cols !== this.cols) {
      this.cols = cols;
      this.#schedule();
    }
  }

  // Card widths are written for a board 9 to 12 cells wide. On a narrower one they keep their share of the row,
  // and no card is narrower than two columns.
  #span(w) {
    const cols = this.cols;
    return Math.min(cols, Math.max(cols >= 4 ? 2 : 1, Math.ceil((w * cols) / (cols >= 10 ? 12 : 9))));
  }

  #pending = false;
  #schedule() {
    if (this.#pending) return;
    this.#pending = true;
    queueMicrotask(() => {
      this.#pending = false;
      this.#render();
    });
  }

  #render() {
    const b = this.board;
    const wrap = this.shadowRoot.querySelector(".wrap");
    const focused = this.shadowRoot.activeElement?.dataset?.key;
    // The card that waits for the user comes to them: the focused one if it asks, else the oldest.
    const asking = b.cards.filter((c) => asks(c.kind) && !(c.fields.get("sent") || (c.kind === "decision" && c.fields.get("chosen"))));
    const turn = asking.find((c) => c.id === b.focus) ?? asking[0] ?? null;
    const kids = [];
    if (turn || b.say) {
      kids.push(
        h("aside", {},
          turn && h("div", { class: "turn" }, h("i"), h("span", { text: "My turn" }), h("small", { text: `${asking.length} left` })),
          turn && this.#card(turn, b.topics.find((t) => t.id === turn.topic)?.name),
          h("div", { class: "say", text: b.say })),
      );
    }
    const main = h("main");
    let lastGroup;
    const order = [...b.topics].sort((x, y) => b.groups.findIndex((g) => g.id === x.group) - b.groups.findIndex((g) => g.id === y.group));
    for (const t of b.groups.length ? order : b.topics) {
      const cards = b.cards.filter((c) => c.topic === t.id && c !== turn);
      if (b.groups.length && t.group !== lastGroup) {
        lastGroup = t.group;
        main.append(h("div", { class: "group", text: b.groups.find((g) => g.id === t.group)?.name ?? "Other" }));
      }
      main.append(h("section", {}, h("h2", { text: t.name }, h("small", { text: String(cards.length) })), h("div", { class: "grid" }, cards.map((c) => this.#card(c)))));
    }
    if (b.topics.length === 0 && b.shelf.length === 0) main.append(h("div", { class: "empty", text: "Nothing on the board yet." }));
    if (b.shelf.length) {
      main.append(h("div", { class: "shelf" }, h("span", { text: "On the shelf:" }),
        b.shelf.map((s) => h("button", { class: "pill", title: "Bring it back", text: `${s.topic.name} (${s.cards.length})`, onclick: () => this.#user(`restore ${s.topic.id}`) }))));
    }
    kids.push(main);
    wrap.className = turn || b.say ? "wrap" : "wrap solo";
    wrap.style.setProperty("--cols", this.cols);
    wrap.replaceChildren(...kids);
    this.#fit();
    if (focused) this.shadowRoot.querySelector(`[data-key="${CSS.escape(focused)}"]`)?.focus();
  }

  #card(c, topicName = null) {
    const b = this.board;
    const f = (name) => b.show(c.fields.get(name) ?? "");
    // In a field named `text`, the two characters \n are shown as a line break.
    const text = () => f("text").replaceAll("\\n", "\n");
    const body = [];
    const para = (s, cls) => s && body.push(h("p", { class: cls, text: s }));
    const cell = (item, n) => b.show(item.cells[n] ?? "");
    const rows = () => {
      const cols = splitCells(f("cols")).filter(Boolean);
      if (!c.items.length && !cols.length) return;
      body.push(h("div", { class: "rows" }, h("table", {}, cols.length && h("tr", {}, cols.map((x) => h("th", { text: x }))), c.items.map((i) => h("tr", {}, i.cells.map((x) => h("td", { text: b.show(x) })))))));
    };
    switch (c.kind) {
      case "note":
        para(text());
        break;
      case "status":
        body.push(h("div", { class: "row" }, h("i", { class: `dot ${f("state")}` }), h("b", { text: { ok: "OK", run: "Running", wait: "Waiting", fail: "Failed", idle: "Idle" }[f("state")] ?? "" })));
        para(text(), "dim");
        break;
      case "metric": {
        const d = f("delta");
        body.push(h("div", {}, h("span", { class: `big${[...f("value")].length > 6 ? " long" : ""}`, text: f("value") }), h("span", { class: "unit", text: f("unit") })));
        if (d) body.push(h("div", { class: `delta ${d.startsWith("+") ? "up" : d.startsWith("-") ? "down" : "dim"}`, text: d }));
        para(text(), "dim");
        break;
      }
      case "chart":
        body.push(chart(c, f("form"), f("unit"), b));
        break;
      case "route":
        if (f("total")) body.push(h("div", {}, h("b", { text: f("total") })));
        para(text(), "dim");
        body.push(route(c));
        for (const i of c.items) body.push(h("div", { class: "row" }, h("i", { class: "dot run" }), h("b", { text: cell(i, 0) }), h("span", { class: "dim", text: cell(i, 2) })));
        break;
      case "draw":
        body.push(drawing(c, b));
        para(text(), "dim");
        break;
      case "table":
        rows();
        break;
      case "progress": {
        const pct = Number(f("pct"));
        if (f("pct")) body.push(h("div", { class: "row" }, h("div", { class: "bar" }, h("i", { style: `width:${Math.min(Math.max(pct, 0), 100)}%` })), h("b", { text: `${pct}%` })));
        para(text(), "dim");
        for (const i of c.items) body.push(h("div", { class: "row" }, h("i", { class: `dot ${i.cells[0]}` }), h("span", { class: i.cells[0] === "todo" ? "dim" : "", text: cell(i, 1) })));
        break;
      }
      case "checklist":
        for (const i of c.items) {
          const done = i.cells[0] === "done";
          body.push(h("div", { class: "row" },
            h("button", { class: `check ${done ? "done" : ""}`, "aria-label": done ? "Untick" : "Tick", onclick: () => this.#user(`upd ${c.id} ${i.id} ${done ? "todo" : "done"} | ${joinCells(i.cells.slice(1))}`) }),
            h("span", { class: done ? "dim" : "", text: cell(i, 1) })));
        }
        break;
      case "timeline":
        for (const i of c.items) body.push(h("div", { class: "row" }, h("i", { class: `dot ${i.cells[2] ?? ""}` }), h("b", { text: cell(i, 0) }), h("span", { class: "dim", text: cell(i, 1) })));
        break;
      case "decision":
        this.#decision(c, body, text());
        break;
      case "input":
        this.#input(c, body, text());
        break;
      case "record": {
        para(text(), "dim");
        const kv = [...c.fields.entries()].filter(([k]) => k !== "text" && k !== "cols").sort((x, y) => (x[0] < y[0] ? -1 : 1));
        if (kv.length) body.push(h("div", { class: "kv" }, kv.flatMap(([k, v]) => [h("span", { text: k.replace(/[-_]/g, " ") }), h("span", { text: b.show(v) })])));
        rows();
        break;
      }
      case "image":
      case "web":
      case "doc": {
        const src = f(c.kind === "web" ? "url" : "src");
        const online = /^https?:\/\//iu.test(src);
        if (c.kind === "doc") {
          const name = src.replace(/[\\/]+$/u, "").split(/[\\/]/u).pop() ?? "";
          body.push(h("div", { class: "row" }, h("b", { text: name || "Nothing to open yet" }), this.media && online && h("a", { href: src, target: "_blank", rel: "noopener noreferrer", text: "Open" })));
          para(text());
        } else if (!this.media || !online) {
          body.push(h("div", { class: "media", text: src ? (this.media ? src : "Shown only where this board allows media") : "Nothing to show yet" }));
          para(text(), "dim");
        } else if (c.kind === "image") {
          body.push(h("img", { src, alt: text(), referrerpolicy: "no-referrer", loading: "lazy" }));
          para(text(), "dim");
        } else {
          body.push(h("iframe", { src, sandbox: "allow-scripts allow-forms allow-popups", referrerpolicy: "no-referrer", loading: "lazy", title: c.title }));
        }
        break;
      }
    }
    return h("article", { class: `card ${c.kind}${c.id === b.focus ? " focus" : ""}${c.fields.get("tone") === "danger" ? " danger" : ""}`, style: `--w:${this.#span(c.w)};--h:${c.h}`, "data-id": c.id },
      h("h3", { text: b.show(c.title) }, topicName && h("small", { text: topicName })), body);
  }

  #decision(c, body, question) {
    if (question) body.push(h("p", { text: question }));
    const chosen = (c.fields.get("chosen") ?? "").split(",").filter(Boolean);
    const multi = c.fields.get("multi") === "yes";
    const answered = chosen.length > 0;
    const key = (i) => `${c.id}:#${i.id}`;
    for (const i of c.items) {
      const on = chosen.includes(i.id) || (multi && !answered && this.drafts.has(key(i)));
      body.push(h("button", { class: `opt${on ? " on" : ""}`, "data-key": key(i), onclick: () => {
        if (answered) return;
        if (!multi) return this.#user(`set ${c.id} chosen ${i.id}`);
        // With several answers a press only marks the option; the answer goes out with "Done".
        this.drafts.has(key(i)) ? this.drafts.delete(key(i)) : this.drafts.set(key(i), "1");
        this.#schedule();
      } }, h("b", { text: this.board.show(i.cells[0]) }), i.cells[1] && h("span", { text: this.board.show(i.cells[1]) })));
    }
    if (multi && !answered) {
      const picked = c.items.filter((i) => this.drafts.has(key(i))).map((i) => i.id);
      body.push(h("button", { class: "go", disabled: picked.length === 0, text: "Done", onclick: () => {
        for (const i of c.items) this.drafts.delete(key(i));
        this.#user(`set ${c.id} chosen ${picked.join(",")}`);
      } }), h("span", { class: "faint", text: "Pick as many as apply" }));
    }
  }

  #input(c, body, question) {
    if (question) body.push(h("p", { text: question }));
    const sent = Boolean(c.fields.get("sent"));
    const key = (i) => `${c.id}:${i.id}`;
    const value = (i) => this.drafts.get(key(i)) ?? i.cells[2] ?? "";
    const required = (i) => i.cells[0].trimEnd().endsWith("*");
    let send;
    const ready = () => c.items.some((i) => value(i).trim()) && c.items.every((i) => !required(i) || value(i).trim());
    const set = (i, v) => {
      this.drafts.set(key(i), v);
      if (send) send.disabled = !ready();
    };
    for (const i of c.items) {
      const spec = (i.cells[1] ?? "").trim();
      body.push(h("label", { text: i.cells[0] }));
      const slider = /^slider\s+(-?[\d.]+)~(-?[\d.]+)\s*(.*)$/u.exec(spec);
      const choice = /^choice\s+(.+)$/u.exec(spec);
      if (choice && choice[1].split("/").length >= 2) {
        body.push(h("div", {}, choice[1].split("/").map((o) => o.trim()).filter(Boolean).map((o) =>
          h("button", { class: `pill${value(i) === o ? " on" : ""}`, disabled: sent, onclick: () => { set(i, o); this.#schedule(); } , text: o }))));
      } else if (slider) {
        const [lo, hi, unit] = [Number(slider[1]), Number(slider[2]), slider[3]];
        const out = h("span", { class: "dim", text: value(i) ? `${value(i)} ${unit}` : `${lo}~${hi} ${unit}` });
        body.push(h("input", { type: "range", min: lo, max: hi, step: hi - lo >= 20 ? 1 : 0.1, value: value(i) || lo, disabled: sent, "data-key": key(i), oninput: (e) => { set(i, e.target.value); out.textContent = `${e.target.value} ${unit}`; } }), out);
      } else {
        const type = { date: "date", time: "time", number: "number" }[spec] ?? "text";
        body.push(h("input", { type, value: value(i), placeholder: type === "text" && spec !== "-" ? spec : null, disabled: sent, "data-key": key(i), oninput: (e) => set(i, e.target.value) }));
      }
    }
    if (sent) return body.push(h("p", { class: "faint", text: "Sent" }));
    send = h("button", { class: "go", text: "Send", disabled: !ready(), onclick: () => {
      const lines = [];
      for (const i of c.items) {
        const v = value(i).replace(/[\r\n]+/gu, " ").trim();
        if (v) lines.push(`upd ${c.id} ${i.id} ${joinCells([i.cells[0], i.cells[1] || "-", v])}`);
        this.drafts.delete(key(i));
      }
      this.#user(...lines, `set ${c.id} sent yes`);
    } });
    body.push(send);
  }
}

// ---------------------------------------------------------------- pictures

const num = (s) => Number(String(s).replaceAll(",", ""));

function chart(c, form, unit, b) {
  const items = c.items.map((i) => ({ name: b.show(i.cells[0]), v: num(i.cells[1]) }));
  const max = Math.max(1, ...items.map((i) => i.v));
  if (form === "donut") {
    const total = items.reduce((s, i) => s + Math.max(i.v, 0), 0) || 1;
    const shades = [1, 0.72, 0.5, 0.34, 0.22, 0.14];
    let a = -Math.PI / 2;
    const arcs = items.map((i, n) => {
      const sweep = (Math.max(i.v, 0) / total) * Math.PI * 2;
      const [x1, y1, x2, y2] = [50 + 38 * Math.cos(a), 50 + 38 * Math.sin(a), 50 + 38 * Math.cos(a + sweep), 50 + 38 * Math.sin(a + sweep)];
      a += sweep;
      return h("path", { d: `M ${x1} ${y1} A 38 38 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2}`, fill: "none", stroke: "var(--soft)", "stroke-width": 14, opacity: shades[n % shades.length] });
    });
    return h("div", { class: "row", style: "align-items:flex-start" }, h("svg", { viewBox: "0 0 100 100", style: "width:120px;flex:none" }, arcs),
      h("div", {}, items.map((i) => h("div", { class: "row" }, h("b", { text: i.name }), h("span", { class: "dim", text: `${Math.round((i.v / total) * 100)}%` })))));
  }
  if (form === "line") {
    const [w, hgt, pad] = [300, 120, 14];
    const x = (n) => pad + (n * (w - pad * 2)) / Math.max(items.length - 1, 1);
    const min = Math.min(...items.map((i) => i.v), max);
    const y = (v) => hgt - 22 - ((v - min) / Math.max(max - min, 1)) * (hgt - 44);
    return h("svg", { viewBox: `0 0 ${w} ${hgt}` },
      h("polyline", { points: items.map((i, n) => `${x(n)},${y(i.v)}`).join(" "), fill: "none", stroke: "var(--soft)", "stroke-width": 2 }),
      items.map((i, n) => [h("circle", { cx: x(n), cy: y(i.v), r: 3, fill: "var(--text)" }), h("text", { x: x(n), y: hgt - 4, "text-anchor": "middle", text: i.name }), h("text", { x: x(n), y: y(i.v) - 7, "text-anchor": "middle", text: `${i.v}${unit}` })]));
  }
  return h("div", {}, items.map((i) => h("div", { class: "row" }, h("b", { style: "flex:0 0 34%", text: i.name }), h("div", { class: "bar", style: "min-width:24px" }, h("i", { style: `width:${(Math.max(i.v, 0) / max) * 100}%` })), h("span", { class: "dim", style: "flex:none;overflow:visible", text: `${i.v}${unit ? " " + unit : ""}` }))));
}

function route(c) {
  const pts = c.items.map((i) => (i.cells[1] ?? "").split(",").map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
  if (pts.length < 2) return null;
  const [w, hgt, pad] = [300, 150, 18];
  const lats = pts.map((p) => p[0]), lons = pts.map((p) => p[1]);
  const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const k = Math.cos(((la0 + la1) / 2) * (Math.PI / 180));
  const scale = Math.min((w - pad * 2) / Math.max((lo1 - lo0) * k, 1e-9), (hgt - pad * 2) / Math.max(la1 - la0, 1e-9));
  const xy = (p) => [w / 2 + (p[1] - (lo0 + lo1) / 2) * k * scale, hgt / 2 - (p[0] - (la0 + la1) / 2) * scale];
  return h("svg", { viewBox: `0 0 ${w} ${hgt}` }, h("polyline", { points: pts.map((p) => xy(p).join(",")).join(" "), fill: "none", stroke: "var(--accent)", "stroke-width": 2.5, "stroke-linejoin": "round" }),
    pts.map((p) => h("circle", { cx: xy(p)[0], cy: xy(p)[1], r: 4, fill: "var(--card)", stroke: "var(--accent)", "stroke-width": 2 })));
}

function drawing(c, b) {
  const xy = (s) => (s ?? "").trim().split(/\s+/u).map((p) => p.split(",").map(Number));
  const shapes = [h("defs", {}, h("marker", { id: "head", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse" }, h("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "context-stroke" })))];
  for (const i of c.items) {
    const [shape, coords, label, color, size] = i.cells;
    const col = COLORS[color] ?? "var(--soft)";
    const pts = xy(coords);
    const fs = size === "s" ? 3.4 : size === "l" ? 6 : 4.4;
    const t = (x, y, text) => text && shapes.push(h("text", { x, y, "text-anchor": "middle", "dominant-baseline": "middle", style: `font-size:${fs}px;fill:${color ? col : "var(--text)"}`, text: b.show(text) }));
    if (shape === "rect" && pts.length >= 2) {
      const [[x, y], [w, hgt]] = pts;
      shapes.push(h("rect", { x, y, width: w, height: hgt, rx: 2.5, fill: "var(--raised)", stroke: col, "stroke-width": 0.5 }));
      t(x + w / 2, y + hgt / 2, label);
    } else if (shape === "circle" && pts.length >= 2) {
      const [[x, y], [r]] = pts;
      shapes.push(h("circle", { cx: x, cy: y, r, fill: "var(--raised)", stroke: col, "stroke-width": 0.5 }));
      t(x, y, label);
    } else if ((shape === "line" || shape === "arrow") && pts.length >= 2) {
      shapes.push(h("polyline", { points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: col, "stroke-width": 0.6, "marker-end": shape === "arrow" ? "url(#head)" : null }));
      const mid = pts[Math.floor((pts.length - 1) / 2)], nxt = pts[Math.floor((pts.length - 1) / 2) + 1] ?? mid;
      t((mid[0] + nxt[0]) / 2, (mid[1] + nxt[1]) / 2 - 3, label);
    } else if (shape === "text" && pts.length >= 1) {
      t(pts[0][0], pts[0][1], label);
    }
  }
  return h("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "xMidYMid meet", style: "max-height:320px" }, shapes);
}

if (!customElements.get("patet-board")) customElements.define("patet-board", PatetBoard);
