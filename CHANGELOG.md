# KITE Protocol changes

## 0.2 (2026-11-18)

The protocol becomes a specification of its own, apart from the KITE app.

- **Stable error codes.** A rejection is a code and an English message (`unknown-verb unknown verb 'foo'`). 0.1 gave a free-form Korean sentence. Codes are listed in SPEC.md section 9.
- **Clipping notes** have one form: `clipped <what> <limit>`.
- **Events** are defined: `user <op>`, `input <text>`, `agent <op>`.
- **Line session** (SPEC.md 10.3): replies are `ok`, `ok clipped ...`, `err <code> <message>`. New commands `read [<topic>]`, `watch [all]`, `unwatch`. 0.1 answered `err <line> → <reason>` and had no way to read the board or hear the user.
- **MCP binding** (10.4): tools `screen`, `board_read`, `events`, `guide`.
- **AG-UI binding** (10.5).
- **Conformance cases** and a reference implementation without dependencies (`kite-protocol`).
- **Guide for agents** (GUIDE.md).
- The header reads `# kite-protocol 0.2`. Files and streams of 0.1 are read unchanged: no verb, card type, limit or serialization order changed.

## 0.1 (2026-11-16)

First written description of what KITE 0.3.0 accepted: 19 verbs, 14 card types, the log format, the version header, a one-way line socket.
