// Runs the protocol's conformance cases (../conformance) and the examples against the JavaScript implementation.
//   node protocol/js/test.mjs
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Board, LineStream, joinCells, partsTable, serialize, splitCells } from "./kite-protocol.js";

const here = dirname(fileURLToPath(import.meta.url));
const expand = (s) => s.replace(/<(\d+) (.)>/gu, (_, n, c) => c.repeat(Number(n)));
const tidy = (s) => s.split("\n").map((l) => l.trimEnd()).join("\n").trimEnd();
let failed = 0;
const check = (ok, what) => {
  if (!ok) {
    failed++;
    console.error("FAIL", what);
  }
};

const dir = join(here, "..", "conformance");
const files = readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
check(files.length >= 8, `expected the conformance cases, found ${files.length}`);
let lines = 0;
for (const file of files) {
  const text = readFileSync(join(dir, file), "utf8").replaceAll("\r\n", "\n");
  const at = text.indexOf("\nboard:\n");
  const script = text.slice(0, at).split("\n");
  const want = expand(text.slice(at + "\nboard:\n".length));
  const board = new Board();
  for (let i = 0; i < script.length; i++) {
    const line = script[i];
    const by = line.startsWith("agent:") ? "agent" : line.startsWith("user:") ? "user" : null;
    if (!by) continue;
    let op = line.slice(line.indexOf(":") + 1);
    if (op.startsWith(" ")) op = op.slice(1);
    const expected = script[++i].trim().replace(/^-> /u, "");
    let got = board.line(expand(op), by);
    if (got.startsWith("err ")) got = got.split(" ").slice(0, 2).join(" "); // a rejection is matched on its code
    check(got === expected, `${file}:${i}: ${line}\n     expected: ${expected}\n     got:      ${got}`);
    lines++;
  }
  const got = serialize(board);
  check(tidy(got) === tidy(want), `${file}: the board at the end\n--- expected\n${tidy(want)}\n--- got\n${tidy(got)}`);
  // What was written back rebuilds the same board when the user replays it.
  const again = new Board();
  for (const l of got.split("\n")) if (l) check(again.line(l, "user") === "ok", `${file}: replay of '${l}'`);
  check(serialize(again) === got, `${file}: replaying the board`);
}

// The examples apply without a rejection.
const examples = join(here, "..", "examples");
for (const file of readdirSync(examples).filter((f) => f.endsWith(".ops"))) {
  const board = new Board();
  for (const l of readFileSync(join(examples, file), "utf8").replaceAll("\r\n", "\n").split("\n")) {
    const tab = l.indexOf("\t");
    if (tab < 0 || l[0] === "T") continue;
    const v = board.line(l.slice(tab + 1), l[0] === "U" ? "user" : "agent");
    check(v === "ok" || v === "skip", `${file}: ${l} -> ${v}`);
  }
}

// The guide's table is this implementation's table.
const guide = readFileSync(join(here, "..", "GUIDE.md"), "utf8").replaceAll("\r\n", "\n");
check(guide.split("<!-- parts:begin -->\n")[1]?.split("<!-- parts:end -->")[0] === partsTable(), "the card type table differs from GUIDE.md");

// Cells and streams.
check(JSON.stringify(splitCells("a | b\\|c | d")) === '["a","b|c","d"]', "splitCells");
check(joinCells(["a|b", "c"]) === "a\\|b | c", "joinCells");
const s = new LineStream();
const got = [...s.feed("topic t A\nset k te"), ...s.feed("xt hi\nsay en"), ...s.feed("d")];
check(JSON.stringify(got) === '["topic t A","set k text hi"]' && s.partial === "say end" && s.finish() === "say end", "LineStream");

console.log(failed ? `${failed} failed` : `ok: ${files.length} conformance cases (${lines} lines), examples, guide table`);
process.exit(failed ? 1 : 0);
