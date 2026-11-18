// Checks the two grammars against the lines this repository already trusts.
//   node grammar/check.mjs
//
// patet.ebnf is read, each production is turned into a regular expression (the grammar has no
// recursion, so that is exact), and then:
//   1. every op line of examples/*.ops and examples/scenes-todo.txt must be derived by `Line`;
//   2. every op line of conformance/*.txt whose verdict is `ok` (or `ok clipped ...`) must be
//      derived by the production of its verb, and every `skip` line by `Line`;
//   3. every line of every expected board in conformance/*.txt must be derived too;
//   4. no line rejected for its form (unknown-verb, missing-argument, bad-syntax, unknown-kind,
//      cell-count) may be derived.
// patet.gbnf is turned into a regular expression the same way and must accept each scene of
// scenes-todo.txt and each example as one turn, and refuse a few turns that break its rules.
// No dependencies. Exit code 1 when anything fails.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const read = (...p) => readFileSync(join(root, ...p), "utf8").replaceAll("\r\n", "\n");
const u = (cp) => `\\u{${cp.toString(16)}}`;
const lit = (s) => [...s].map((c) => u(c.codePointAt(0))).join("");

// ---------------------------------------------------------------- W3C EBNF -> regular expressions

function readEbnf(text) {
  text = text.replace(/\/\*[\s\S]*?\*\//g, " ");
  const rules = new Map();
  const starts = [...text.matchAll(/(?:^|\n)[ \t]*([A-Za-z][A-Za-z0-9]*)[ \t]*::=/g)];
  starts.forEach((m, i) => {
    const from = m.index + m[0].length;
    rules.set(m[1], text.slice(from, i + 1 < starts.length ? starts[i + 1].index : text.length));
  });
  return rules;
}

function ebnfTokens(src) {
  const out = [];
  const re = /\s+|([A-Za-z][A-Za-z0-9]*)|'([^']*)'|"([^"]*)"|#x([0-9A-Fa-f]+)|\[([^\]]*)\]|([()|?*+-])/gy;
  let m;
  while (re.lastIndex < src.length) {
    if (!(m = re.exec(src))) throw new Error(`EBNF: cannot read: ${src.slice(re.lastIndex, re.lastIndex + 20)}`);
    if (m[1] !== undefined) out.push({ t: "name", v: m[1] });
    else if (m[2] !== undefined || m[3] !== undefined) out.push({ t: "re", v: lit(m[2] ?? m[3]) });
    else if (m[4] !== undefined) out.push({ t: "re", v: u(parseInt(m[4], 16)) });
    else if (m[5] !== undefined) out.push({ t: "re", v: ebnfClass(m[5]) });
    else if (m[6] !== undefined) out.push({ t: m[6] });
  }
  return out;
}

// [a-z], [#x20-#x7E], [^...]: every member is written as a code point escape.
function ebnfClass(body) {
  const not = body.startsWith("^");
  const cps = [];
  const re = /#x([0-9A-Fa-f]+)|([\s\S])/gu;
  for (const m of (not ? body.slice(1) : body).matchAll(re)) cps.push(m[1] !== undefined ? parseInt(m[1], 16) : m[2].codePointAt(0));
  let s = "";
  for (let i = 0; i < cps.length; i++) {
    if (cps[i + 1] === 0x2d && i + 2 < cps.length) {
      s += `${u(cps[i])}-${u(cps[i + 2])}`;
      i += 2;
    } else s += u(cps[i]);
  }
  return `[${not ? "^" : ""}${s}]`;
}

function compiler(rules, tokenize) {
  const done = new Map();
  const busy = new Set();
  const rule = (name) => {
    if (done.has(name)) return done.get(name);
    if (!rules.has(name)) throw new Error(`no rule '${name}'`);
    if (busy.has(name)) throw new Error(`rule '${name}' is recursive: not a regular expression`);
    busy.add(name);
    const toks = tokenize(rules.get(name));
    let at = 0;
    const alt = () => {
      const seqs = [seq()];
      while (toks[at]?.t === "|") {
        at++;
        seqs.push(seq());
      }
      return seqs.length === 1 ? seqs[0] : `(?:${seqs.join("|")})`;
    };
    const seq = () => {
      let s = "";
      while (at < toks.length && toks[at].t !== "|" && toks[at].t !== ")") {
        let a = post();
        if (toks[at]?.t === "-") {
          at++;
          a = `(?:(?!${post()})${a})`; // A - B, used for single characters only
        }
        s += a;
      }
      return s;
    };
    const post = () => {
      let a = prim();
      while (["?", "*", "+", "rep"].includes(toks[at]?.t)) {
        const t = toks[at++];
        a = `(?:${a})${t.t === "rep" ? t.v : t.t}`;
      }
      return a;
    };
    const prim = () => {
      const t = toks[at++];
      if (!t) throw new Error(`rule '${name}' ends too soon`);
      if (t.t === "name") return rule(t.v);
      if (t.t === "re") return t.v;
      if (t.t === "(") {
        const a = alt();
        if (toks[at++]?.t !== ")") throw new Error(`rule '${name}': missing )`);
        return `(?:${a})`;
      }
      throw new Error(`rule '${name}': unexpected ${t.t}`);
    };
    const out = `(?:${alt()})`;
    if (at < toks.length) throw new Error(`rule '${name}': unexpected ${toks[at].t}`);
    busy.delete(name);
    done.set(name, out);
    return out;
  };
  return (name) => new RegExp(`^${rule(name)}$`, "u");
}

// ---------------------------------------------------------------- GBNF -> regular expression

function readGbnf(text) {
  const rules = new Map();
  let last = null;
  for (const raw of text.split("\n")) {
    const line = raw.startsWith("#") ? "" : raw;
    const m = /^([a-zA-Z0-9-]+)\s*::=(.*)$/.exec(line);
    if (m) rules.set((last = m[1]), m[2]);
    else if (line.trim() !== "" && last) rules.set(last, rules.get(last) + " " + line);
  }
  return rules;
}

function gbnfChar(src, i) {
  // Returns [code point, next index] for the character or escape at i.
  if (src[i] !== "\\") {
    const cp = src.codePointAt(i);
    return [cp, i + (cp > 0xffff ? 2 : 1)];
  }
  const c = src[i + 1];
  const hex = { x: 2, u: 4, U: 8 }[c];
  if (hex) return [parseInt(src.slice(i + 2, i + 2 + hex), 16), i + 2 + hex];
  const plain = { n: 10, r: 13, t: 9 }[c];
  return [plain ?? c.codePointAt(0), i + 2];
}

function gbnfTokens(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) i++;
    else if (c === "#") break;
    else if (c === '"') {
      let s = "";
      i++;
      while (src[i] !== '"') {
        const [cp, next] = gbnfChar(src, i);
        s += u(cp);
        i = next;
      }
      i++;
      out.push({ t: "re", v: s });
    } else if (c === "[") {
      i++;
      const not = src[i] === "^";
      if (not) i++;
      let s = "";
      while (src[i] !== "]") {
        const [a, next] = gbnfChar(src, i);
        i = next;
        if (src[i] === "-" && src[i + 1] !== "]") {
          const [b, after] = gbnfChar(src, i + 1);
          s += `${u(a)}-${u(b)}`;
          i = after;
        } else s += u(a);
      }
      i++;
      out.push({ t: "re", v: `[${not ? "^" : ""}${s}]` });
    } else if (c === "{") {
      const end = src.indexOf("}", i);
      out.push({ t: "rep", v: src.slice(i, end + 1) });
      i = end + 1;
    } else if ("()|?*+".includes(c)) {
      out.push({ t: c });
      i++;
    } else {
      const m = /^[a-zA-Z0-9-]+/.exec(src.slice(i));
      if (!m) throw new Error(`GBNF: cannot read: ${src.slice(i, i + 20)}`);
      out.push({ t: "name", v: m[0] });
      i += m[0].length;
    }
  }
  return out;
}

// ---------------------------------------------------------------- the lines to check

const expand = (s) => s.replace(/<(\d+) (.)>/gu, (_, n, c) => c.repeat(Number(n)));
let failed = 0;
const fail = (what) => {
  failed++;
  console.error("FAIL", what);
};

const ebnfRules = readEbnf(read("grammar", "patet.ebnf"));
const ebnf = compiler(ebnfRules, ebnfTokens);
const Line = ebnf("Line");
// The productions `Op` names, each with the verb it starts with.
const verbs = new Map();
for (const t of ebnfTokens(ebnfRules.get("Op"))) {
  if (t.t !== "name") continue;
  const verb = /'([a-z]+)'/.exec(ebnfRules.get(t.v))?.[1];
  verbs.set(verb, new RegExp(`^${ebnf("WS").source.slice(1, -1)}*${ebnf(t.v).source.slice(1, -1)}${ebnf("WS").source.slice(1, -1)}*$`, "u"));
}
// White space is the Unicode property White_Space, which is not what \s and trim() take in JavaScript.
const WHITE = "\\t-\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const SPACE = new RegExp(`[${WHITE}]+`, "u");
const SPACE_AROUND = new RegExp(`^[${WHITE}]+|[${WHITE}]+$`, "gu");
const count = { examples: [0, 0], ok: [0, 0], skip: [0, 0], board: [0, 0], refused: [0, 0] };
const derived = (group, line, where) => {
  count[group][1]++;
  const body = line.replace(SPACE_AROUND, "");
  const verb = body.split(SPACE)[0];
  const blank = body === "" || body.startsWith("#") || body.startsWith("```");
  const ok = blank ? Line.test(line) : verbs.has(verb) && verbs.get(verb).test(line) && Line.test(line);
  if (ok) count[group][0]++;
  else fail(`${where}: not derived: ${line.length > 120 ? line.slice(0, 120) + "..." : line}`);
};

const examples = readdirSync(join(root, "examples"));
for (const file of examples.filter((f) => f.endsWith(".ops"))) {
  for (const l of read("examples", file).split("\n")) {
    const tab = l.indexOf("\t");
    if (l === "" || (tab >= 0 && l[0] === "T")) continue;
    derived("examples", tab < 0 ? l : l.slice(tab + 1), file);
  }
}
const scenes = read("examples", "scenes-todo.txt").split(/^===\n/mu);
for (const scene of scenes) for (const l of scene.split("\n")) if (l !== "") derived("examples", l, "scenes-todo.txt");

const FORM = ["unknown-verb", "missing-argument", "bad-syntax", "unknown-kind", "cell-count"];
const cases = readdirSync(join(root, "conformance")).filter((f) => f.endsWith(".txt")).sort();
for (const file of cases) {
  const text = read("conformance", file);
  const at = text.indexOf("\nboard:\n");
  const script = text.slice(0, at).split("\n");
  for (let i = 0; i < script.length; i++) {
    const line = script[i];
    if (!line.startsWith("agent:") && !line.startsWith("user:")) continue;
    let op = line.slice(line.indexOf(":") + 1);
    if (op.startsWith(" ")) op = op.slice(1);
    op = expand(op);
    const verdict = script[++i].trim().replace(/^-> /u, "");
    const where = `${file}:${i}`;
    if (verdict === "ok" || verdict.startsWith("ok ")) derived("ok", op, where);
    else if (verdict === "skip") derived("skip", op, where);
    else if (verdict === "err unknown-kind" && [...(op.replace(SPACE_AROUND, "").split(SPACE)[2] ?? "")].length > 24) continue; // a length limit, not a form
    else if (FORM.includes(verdict.slice(4))) {
      count.refused[1]++;
      if (Line.test(op)) fail(`${where}: derived, but rejected for its form (${verdict}): ${op}`);
      else count.refused[0]++;
    }
  }
  for (const l of expand(text.slice(at + "\nboard:\n".length)).split("\n")) if (l !== "") derived("board", l, `${file}: board`);
}

// ---------------------------------------------------------------- the turn grammar

const turn = compiler(readGbnf(read("grammar", "patet.gbnf")), gbnfTokens)("root");
const turns = [0, 0];
const accepts = (text, want, what) => {
  turns[1]++;
  if (turn.test(text) === want) turns[0]++;
  else fail(`patet.gbnf ${want ? "refuses" : "accepts"} ${what}`);
};
scenes.forEach((scene, i) => accepts(scene, true, `scene ${i + 1} of scenes-todo.txt`));
for (const file of examples.filter((f) => f.endsWith(".ops"))) {
  const ops = read("examples", file).split("\n").filter((l) => l.startsWith("A\t")).map((l) => l.slice(2));
  accepts(ops.join("\n") + "\n", true, file);
}
accepts("say Nothing to change.\n", true, "a turn that is one say");
accepts("topic t Trip\nsay Made a topic.\n", false, "a turn that does not start with say");
accepts("say Pinned it.\npin k1\n", false, "a turn with pin");
accepts("say Two cards.\n\ncard k1 note t Memo\n", false, "a turn with a blank line");
accepts("say Made a card.\ncard k1 gauge t Speed\n", false, "a turn with an unknown card type");
accepts("say Added.\nadd k1 i1 a | b | c | d | e | f | g\n", false, "a turn with a seven-cell item");
accepts("say No line break at the end", false, "a turn whose last line is not ended");

const n = (g) => `${count[g][0]}/${count[g][1]}`;
console.log(`patet.ebnf: examples ${n("examples")}, conformance ok lines ${n("ok")}, skip lines ${n("skip")}, board lines ${n("board")}, form rejections not derived ${n("refused")}`);
console.log(`patet.gbnf: turns ${turns[0]}/${turns[1]}`);
console.log(failed ? `${failed} failed` : `ok: ${cases.length} conformance files, ${examples.filter((f) => f.endsWith(".ops")).length + 1} example files`);
process.exit(failed ? 1 : 0);
