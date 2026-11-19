# PATET: notes for whoever works here next

PATET is a specification first: a line language an AI writes to build and edit a board of cards. This repository holds the spec, the guide for models, the conformance cases, and four implementations. The app built on it is APERIT (https://github.com/fidenit/aperit), in its own repository. The owner reads Korean; write to them in Korean, and keep everything in the repository in English.

## Layout

| | |
|---|---|
| `SPEC.md` | The rules. Normative |
| `GUIDE.md` | What a model is given as its system prompt. Its card table must equal every implementation's `parts_table()` |
| `conformance/` | 37 cases. A behaviour not in a case is not promised |
| `rust/`, `js/`, `python/`, `kotlin/` | The board, the parser, the serializer. No dependencies in any of them |
| `web/` | `<patet-board>`, the renderer for the web; `web/index.html` is the demo served at https://fidenit.github.io/patet/web/ |
| `examples/assistant/` | A whole assistant in two files |
| `grammar/` | EBNF and GBNF, with a checker |

## Checks (all four must pass before a commit)

```sh
cd rust && cargo test && cd ..
node js/test.mjs
node grammar/check.mjs
python -m unittest discover -s python/tests
```

The web element has a self-test: serve the repository (`python -m http.server 8000`) and open `/web/?selftest=1`.

`kotlin/` is a copy of the two files in the APERIT repository (`android/app/src/main/java/com/fidenit/kite/core/`), where they are tested. Change them there, run that app's unit tests, then copy them here (only the `package` line differs).

## Rules of this repository

- A change to the language is one commit that changes SPEC.md, a conformance case, and all four implementations. Write the case first.
- When SPEC and an implementation disagree, do not quietly fix one: decide which is right, say so in CHANGELOG.md under "Settled", pin it with a case.
- Wire names (`patet`, verbs, card kinds, error codes) do not change within a major version. Readers still accept the old header `# kite-protocol`.
- After changing anything here, the APERIT repository takes it with `python tools/vendor_patet.py` (run there, with this repository beside it).

## Where things stand (2026-11-19)

- Version 0.5: one addition to 0.4, the field `by` (who wrote a card, case 37). The online demo is on.
- **Packages are not published yet.** `npm publish` (from the repository root) needs the owner's passkey in a real terminal. `cargo publish` (in `rust/`) passed its dry run and waits for the owner's word. PyPI: no account or token yet; until then `pip install "git+https://github.com/fidenit/patet#subdirectory=python"` works and is documented. Once npm is published, replace "There is no npm package yet" in `web/README.md` with `npm install patet` (`import "patet/board"`).
- The fuller list of what is next, for both repositories, is at the top of `docs/NEXT.md` in the APERIT repository (Korean).
- Not checked anywhere: the GBNF on a real llama.cpp; Python 3.9 (only 3.13 was run); the example against a model that is not Claude; trademarks in KIPRIS (USPTO has PATET only in class 35, retail).
- Not built: dragging and resizing cards in `<patet-board>`; renderers for anything but the web.
- Open decisions for the owner: the license stays Apache-2.0 unless they say otherwise; when to call it 1.0; whether to add `code` and `diff` card types (recommended earlier, not started).
