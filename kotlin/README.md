# PATET in Kotlin

`Board.kt` and `Lang.kt`: the board, the parser and the serializer, with no dependencies beyond the JVM.

These two files are the ones the [APERIT](https://github.com/fidenit/aperit) Android app is built with (there in the package `com.fidenit.kite.core`; here only the package line differs). They are tested in that app's unit tests, which run every case in [conformance/](../conformance) and check that a board written back and loaded again is the same board. This folder has no build of its own yet: copy the two files into your project.

```kotlin
val board = Board()
val stream = LineStream()
for (chunk in stream.feed(delta)) {
    if (chunk is Chunk.Line) {
        try {
            Lang.parse(chunk.text)?.let { board.apply(it, Author.Ai) }
        } catch (e: Rejected) {
            // "err ${e.code} ${e.message}": tell the model on the next turn
        }
    }
}
val next = Lang.serialize(board)   // the <board> of the next turn
```

What the user does is the same call with `Author.User`. `Lang.load(text)` rebuilds a board from what `serialize` wrote.
