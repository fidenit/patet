# An assistant that answers with a board

Two files, no dependencies, about 200 lines together. Read them top to bottom: this is everything PATET asks of a host.

- [server.mjs](server.mjs): gives the model [GUIDE.md](../../GUIDE.md) and the renderer's description as the system prompt, sends it the turn, and passes its text on as it arrives.
- [index.html](index.html): a `<patet-board>` with a brand of its own, the five parts of a turn, the user's clicks going back as events, and one more turn at once when lines were rejected.

## Run it

From the root of this repository, with Node 18 or later:

```sh
node examples/assistant/server.mjs
# open http://127.0.0.1:8787/
```

With no settings it answers with a canned board, so you can see the page work. Point it at a model with three environment variables:

| | |
|---|---|
| `PATET_API_URL` | The base address of anything that takes the OpenAI chat/completions format. Default `https://api.openai.com/v1`. Ollama: `http://localhost:11434/v1`. OpenRouter: `https://openrouter.ai/api/v1`. Anthropic: `https://api.anthropic.com/v1` |
| `PATET_MODEL` | The model's name there |
| `PATET_API_KEY` | Sent as a Bearer token. Leave it out for a local server |

```sh
PATET_API_URL=http://localhost:11434/v1 PATET_MODEL=qwen3 node examples/assistant/server.mjs
```

`http://127.0.0.1:8787/?ask=Plan+a+picnic` asks at once, which makes a demo link.

## Make it yours

- **Look**: the `patet-board { ... }` block at the top of `index.html`. Every variable is in [web/README.md](../../web/README.md#theming).
- **Model**: `server.mjs` is one `fetch`. Replace it with your provider's SDK; the only contract is "text in, text out, streamed".
- **Memory**: the model keeps none; the board is the memory. `earlier` in `index.html` carries the last few things said.
- **A server that keeps the board** (several pages, Python checks): [web/README.md](../../web/README.md#when-the-server-keeps-the-board).

Checked with a real model (Claude Haiku through Anthropic's OpenAI-compatible address): a request, the streamed board, a click on an option, and the turn that followed. Not checked with other providers.
