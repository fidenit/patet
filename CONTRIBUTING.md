# Contributing to PATET

PATET is a specification first. Code in this repository exists to prove the specification can be implemented, and to save you from implementing it.

## What is where

| | |
|---|---|
| [SPEC.md](SPEC.md) | The rules. If code and SPEC disagree, that is a bug in one of them: open an issue saying which you think is wrong |
| [GUIDE.md](GUIDE.md) | What a model is told. Its card table is checked against every implementation's own table |
| [conformance/](conformance) | Cases every implementation must pass. A behaviour that is not in a case is not yet promised |
| [grammar/](grammar) | The line syntax, for tools and for constrained decoding |
| [rust/](rust), [js/](js), [python/](python), [kotlin/](kotlin) | Implementations of the board, the parser and the serializer |
| [web/](web) | A renderer for the web |

## Proposing a change to the language

1. Open an issue that says what a writer cannot express today, with the ops you wish you could write. A change starts from a board someone needed, not from a feature.
2. A change to the language is a change to SPEC.md, GUIDE.md if a model must know about it, at least one conformance case, and every implementation in this repository, in one pull request. The case comes first: write what should happen, then make the implementations agree.
3. Say which version number it moves ([SPEC.md, section 12](SPEC.md#12-versioning)): an addition is a minor version, anything that makes an existing stream read differently is a major one.

Things that are deliberately not in the language, so that proposals for them need a strong case: nesting, layout chosen by the writer, styling, scripts or expressions, data binding. The reasons are in [COMPARISON.md](COMPARISON.md).

## Adding an implementation or a renderer

An implementation in another language is welcome here if it has no dependencies and passes every conformance case with a runner of its own. A renderer (something that draws) can live in its own repository; tell us and we will list it.

To say that something "supports PATET 0.5", it has to pass the conformance cases of 0.5. Nothing else is required, and nothing less is enough.

## Checks before a pull request

```
cd rust && cargo test
node js/test.mjs
python -m unittest discover -s python/tests
```

All three run the same cases. A case that one of them fails is not merged.

## Compatibility promises

- A stream written for 0.x is read by every later 0.y, except where SPEC.md section 12 says a line may be skipped.
- Names on the wire (`patet`, the verbs, the card kinds, the error codes) do not change within a major version.
- Up to 0.3 the protocol was called KITE Protocol and its header line was `# kite-protocol <version>`. Readers accept that header.

## License

Apache-2.0. By contributing you agree that your contribution is licensed under it.
