# Grammar

The line syntax of PATET 0.5 ([SPEC.md](../SPEC.md) sections 3 and 5) in two machine-readable forms.

- [patet.ebnf](patet.ebnf): every op, in W3C EBNF. Start at `Stream`, `Line` or `Op`. Use it to write a parser, a highlighter or a linter.
- [patet.gbnf](patet.gbnf): one whole turn of a model (`say` first, then ops, one per line) in GBNF, for constrained decoding. With llama.cpp: `llama-cli -m model.gguf --grammar-file grammar/patet.gbnf -sys "$(cat GUIDE.md)" -p "<the turn>"`; servers that take a `grammar` field accept the file's text.
- [check.mjs](check.mjs): `node grammar/check.mjs` turns both grammars into regular expressions and runs them over the examples and the conformance cases. Run it after changing a grammar or adding a case.

A grammar checks form only. It cannot know that an id exists, which fields a card's type has, a limit, or that an answer is the user's to write; the header of `patet.ebnf` lists all of it. A line that passes can still be rejected, so keep feeding verdicts back to the model.

The turn grammar leaves out `pin` and `unpin` (an agent's are always rejected) and writes one space between tokens. To offer a model only the types your renderer lists in `kinds`, shorten its `kind` rule.
