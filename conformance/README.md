# Conformance cases

Each `.txt` file here is one case a renderer can run to check that it follows [SPEC.md](../SPEC.md).

```
# a comment
agent: topic t Trip            an op line and who wrote it (agent or user)
  -> ok                        the verdict expected for that line
agent: card k1 gauge t X
  -> err unknown-kind          a rejection is matched on its code only
agent: set k1 text <300 x>     <N c> stands for the character c repeated N times
  -> ok clipped k1.text 240    a note is matched in full
board:                         everything after this line is the board expected at the end,
topic t Trip                   serialized as in SPEC.md section 8
```

To run a case: start from an empty board, apply each line with its author, compare each verdict, then compare the serialized board. A line the spec says is skipped (blank, comment, code fence, `tell`) has the verdict `skip`.

Three implementations run every file in this folder: Rust (`cargo test -p kite-protocol`), JavaScript (`node protocol/js/test.mjs`) and Kotlin (`./gradlew testFreeDebugUnitTest` in `android/`).
