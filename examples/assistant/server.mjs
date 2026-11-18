// A whole assistant whose answer is a board, in two files. Node 18 or later, no dependencies.
//
//   PATET_API_KEY=sk-...  PATET_MODEL=gpt-5  node examples/assistant/server.mjs      -> http://127.0.0.1:8787/
//
// It talks to any endpoint that takes the OpenAI chat/completions format:
//   PATET_API_URL   default https://api.openai.com/v1   (Ollama: http://localhost:11434/v1, OpenRouter, a gateway, ...)
//   PATET_MODEL     the model's name there
//   PATET_API_KEY   sent as a Bearer token; leave it out for a local server
// Without PATET_MODEL it answers with a canned board, so you can see the page work before you have a key.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const { PATET_API_URL = "https://api.openai.com/v1", PATET_MODEL = "", PATET_API_KEY = "", PORT = "8787" } = process.env;
const guide = readFileSync(join(repo, "GUIDE.md"), "utf8");

const CANNED = `say Two venues compared. Pick one.
topic ws Team Workshop
card k1 table ws 5x2 Venue comparison
set k1 cols Venue | Travel | Cost per person
add k1 r1 Gangneung | 2h 40m | 180,000 KRW
add k1 r2 Gapyeong | 1h 10m | 120,000 KRW
card k2 decision ws 3x3 Which venue?
add k2 o1 Gangneung | Far, but better facilities
add k2 o2 Gapyeong | Close and cheaper
`;
const CANNED_NEXT = `say Noted. This is a canned answer: set PATET_MODEL to talk to a real model.
del k2
card s1 status ws 3x1 Venue
set s1 state ok
set s1 text Chosen
`;

// One turn: the system prompt is GUIDE.md and what the page's renderer can draw; the user message is the turn.
// The model's text goes back to the page as it arrives, and the page applies it line by line.
async function answer(res, { describe, turn }) {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  if (!PATET_MODEL) {
    for (const line of (turn.includes("<events>") ? CANNED_NEXT : CANNED).split(/(?<=\n)/)) {
      res.write(line);
      await new Promise((r) => setTimeout(r, 120));
    }
    return res.end();
  }
  const upstream = await fetch(`${PATET_API_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(PATET_API_KEY ? { authorization: `Bearer ${PATET_API_KEY}` } : {}) },
    body: JSON.stringify({
      model: PATET_MODEL,
      stream: true,
      messages: [
        { role: "system", content: `${guide}\n\n## Your renderer\n\n${describe.join("\n")}\n` },
        { role: "user", content: turn },
      ],
    }),
  });
  if (!upstream.ok) return res.end(`# the model endpoint answered ${upstream.status}: ${(await upstream.text()).slice(0, 300).replace(/\n/g, " ")}\n`);
  // Server-sent events: each `data:` line is a JSON chunk with a piece of text.
  let buffer = "";
  for await (const bytes of upstream.body) {
    buffer += Buffer.from(bytes).toString("utf8");
    let at;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line.startsWith("data:") || line === "data: [DONE]") continue;
      try {
        const text = JSON.parse(line.slice(5)).choices?.[0]?.delta?.content;
        if (text) res.write(text);
      } catch {
        /* a keep-alive or a partial line */
      }
    }
  }
  res.end();
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".md": "text/plain; charset=utf-8" };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "POST" && url.pathname === "/turn") {
      let body = "";
      for await (const chunk of req) body += chunk;
      return await answer(res, JSON.parse(body));
    }
    // The page, and the repository's web/ and js/ folders as they are (the element imports ../js/patet.js).
    const file = url.pathname === "/" ? join(here, "index.html") : normalize(join(repo, url.pathname.slice(1)));
    if (!file.startsWith(repo + sep) || !existsSync(file) || !TYPES[extname(file)]) return res.writeHead(404).end("not found");
    res.writeHead(200, { "content-type": TYPES[extname(file)], "cache-control": "no-store" }).end(readFileSync(file));
  } catch (e) {
    if (!res.headersSent) res.writeHead(500);
    res.end(`# ${String(e.message || e)}\n`);
  }
}).listen(Number(PORT), "127.0.0.1", () => console.log(`http://127.0.0.1:${PORT}/  (${PATET_MODEL ? `${PATET_MODEL} at ${PATET_API_URL}` : "canned answers: set PATET_MODEL for a real model"})`));
