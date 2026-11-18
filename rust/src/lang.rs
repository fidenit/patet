//! The line language. One line is one op, applied the moment the line ends.
//! A board is written back in the same language, so a writer can read what it is about to edit.

use crate::core::{Board, Op, Reject};

/// The protocol version this implementation writes and reads (SPEC.md, Versioning).
pub const VERSION: &str = "0.4";

/// First line of a saved log or a stream. It starts with `#`, so a parser that predates it reads a comment.
pub fn header() -> String {
    format!("# patet {VERSION}")
}

/// The version a header line declares, or None when the line is not a header.
pub fn declared_version(line: &str) -> Option<&str> {
    // Up to 0.3 the protocol was called KITE Protocol; files written then are still read.
    let rest = line.trim().strip_prefix('#')?.trim_start();
    let rest = rest.strip_prefix("patet").or_else(|| rest.strip_prefix("kite-protocol"))?;
    if !rest.starts_with(char::is_whitespace) {
        return None;
    }
    rest.split_whitespace().next()
}

/// Can this implementation read that version? Yes when the major number (the first one) is the same.
pub fn can_read(version: &str) -> bool {
    let major = |v: &str| v.split('.').next().and_then(|m| m.parse::<u32>().ok());
    major(version).is_some() && major(version) == major(VERSION)
}

fn split1(s: &str) -> (&str, &str) {
    let s = s.trim_start();
    match s.find(char::is_whitespace) {
        Some(i) => (&s[..i], s[i..].trim_start()),
        None => (s, ""),
    }
}

fn need<'a>(s: &'a str, usage: &str) -> Result<&'a str, Reject> {
    if s.is_empty() { Err(Reject::new("missing-argument", format!("expected: {usage}"))) } else { Ok(s) }
}

/// A whole number written in ASCII digits only (no sign), or None. A value over `max` is None too.
fn digits(s: &str, max: u32) -> Option<u32> {
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let significant = s.trim_start_matches('0');
    if significant.len() > 9 {
        return None;
    }
    let n: u32 = if significant.is_empty() { 0 } else { significant.parse().ok()? };
    (n <= max).then_some(n)
}

/// A size: `<w>x<h>`, both in ASCII digits only. A number too large for a size is still a size, and is clamped.
fn parse_size(s: &str) -> Option<(u8, u8)> {
    let (w, h) = s.split_once(['x', 'X'])?;
    let side = |t: &str| (!t.is_empty() && t.bytes().all(|b| b.is_ascii_digit())).then(|| digits(t, 255).unwrap_or(255) as u8);
    Some((side(w)?, side(h)?))
}

/// The largest column or row `move` takes.
pub const MAX_CELL: u32 = 9999;

/// Split a value into cells at `|`. Inside a cell, `\|` is a `|` that does not split.
pub fn split_cells(rest: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut it = rest.chars().peekable();
    while let Some(c) = it.next() {
        match c {
            '\\' if it.peek() == Some(&'|') => {
                it.next();
                cur.push('|');
            }
            '|' => out.push(std::mem::take(&mut cur).trim().to_string()),
            c => cur.push(c),
        }
    }
    out.push(cur.trim().to_string());
    out
}

/// Write cells back as one value: joined by ` | `, with a `|` inside a cell written as `\|`.
pub fn join_cells(cells: &[String]) -> String {
    cells.iter().map(|c| c.replace('|', "\\|")).collect::<Vec<_>>().join(" | ")
}

fn cells(rest: &str) -> Vec<String> {
    split_cells(rest)
}

/// Is this line skipped without a verdict? Blank lines, `#` comments and code fences are.
pub fn is_blank(line: &str) -> bool {
    let line = line.trim();
    line.is_empty() || line.starts_with('#') || line.starts_with("```")
}

/// Parse one line. Blank lines, comments and code fences are `Ok(None)`; so is `tell`, which changes no board.
pub fn parse(line: &str) -> Result<Option<Op>, Reject> {
    let line = line.trim();
    if is_blank(line) {
        return Ok(None);
    }
    let (cmd, rest) = split1(line);
    let op = match cmd {
        "topic" => {
            let (id, name) = split1(rest);
            Op::Topic { id: need(id, "topic <id> <name>")?.into(), name: name.into() }
        }
        "group" => {
            let (id, name) = split1(rest);
            Op::Group { id: need(id, "group <id> <name>")?.into(), name: name.into() }
        }
        "mv" => {
            let (card, topic) = split1(rest);
            Op::Mv { card: need(card, "mv <card> <topic>")?.into(), topic: need(topic, "mv <card> <topic>")?.into() }
        }
        "put" => {
            let (topic, group) = split1(rest);
            Op::Put { topic: need(topic, "put <topic> <group>")?.into(), group: need(group, "put <topic> <group>")?.into() }
        }
        "card" => {
            let (id, rest) = split1(rest);
            let (kind, rest) = split1(rest);
            let (topic, rest) = split1(rest);
            need(topic, "card <id> <kind> <topic> [<w>x<h>] <title>")?;
            // The size is optional.
            let (maybe, after) = split1(rest);
            let (size, title) = match parse_size(maybe) {
                Some(s) => (Some(s), after),
                None => (None, rest),
            };
            Op::Card { id: id.into(), kind: kind.into(), topic: topic.into(), size, title: title.into() }
        }
        "set" => {
            let (id, rest) = split1(rest);
            let (field, value) = split1(rest);
            Op::Set { id: id.into(), field: need(field, "set <id> <field> <value>")?.into(), value: value.into() }
        }
        "add" | "upd" => {
            let usage = if cmd == "add" { "add <id> <item> <cell> | <cell> ..." } else { "upd <id> <item> <cell> | <cell> ..." };
            let (id, rest) = split1(rest);
            let (item, rest) = split1(rest);
            need(item, usage)?;
            let c = cells(need(rest, usage)?);
            if cmd == "add" {
                Op::Add { id: id.into(), item: item.into(), cells: c }
            } else {
                Op::Upd { id: id.into(), item: item.into(), cells: c }
            }
        }
        "del" => {
            let (id, item) = split1(rest);
            Op::Del { id: need(id, "del <id> [<item>]")?.into(), item: if item.is_empty() { None } else { Some(item.into()) } }
        }
        "size" => {
            let (id, s) = split1(rest);
            let (w, h) = parse_size(s).ok_or_else(|| Reject::new("bad-syntax", "expected: size <id> <w>x<h>"))?;
            Op::Size { id: id.into(), w, h }
        }
        "move" => {
            let (id, rest) = split1(rest);
            let (c, r) = split1(rest);
            match (digits(c, MAX_CELL), digits(r, MAX_CELL)) {
                (Some(col), Some(row)) => Op::Move { id: id.into(), col: col as i32, row: row as i32 },
                _ => return Err(Reject::new("bad-syntax", "expected: move <id> <col> <row>")),
            }
        }
        "let" => {
            let (name, value) = split1(rest);
            Op::Let { name: need(name, "let <name> <value>")?.into(), value: value.into() }
        }
        "archive" => Op::Archive { topic: need(rest, "archive <topic>")?.into() },
        "restore" => Op::Restore { topic: need(rest, "restore <topic>")?.into() },
        "pin" | "unpin" => Op::Pin { id: need(rest, "pin <id>")?.into(), on: cmd == "pin" },
        "focus" => Op::Focus { id: need(rest, "focus <id>")?.into() },
        "say" => Op::Say { text: rest.into() },
        // A sentence to read aloud. It changes no board, so it is not an op (a renderer with a voice handles it).
        "tell" => return Ok(None),
        _ => return Err(Reject::new("unknown-verb", format!("unknown verb '{cmd}'"))),
    };
    Ok(Some(op))
}

/// Write the whole board in the line language. Applying these lines to an empty board with
/// [`Author::Restore`](crate::core::Author::Restore) gives the same board.
pub fn serialize(b: &Board) -> String {
    serialize_with(b, &|_| 2)
}

/// Write the board with a level of detail per topic: 2 = everything, 1 = card titles only, 0 = the topic
/// name and its card count. A renderer uses this to shorten a very large board for a model; a shortened
/// topic carries a `#` note line, which a reader must treat as a note and never as data.
pub fn serialize_with(b: &Board, level: &dyn Fn(&str) -> u8) -> String {
    let mut s = String::new();
    for (name, value) in &b.vars {
        s += &format!("let {name} {value}\n");
    }
    for g in &b.groups {
        s += &format!("group {} {}\n", g.id, g.name);
    }
    for t in &b.topics {
        s += &format!("topic {} {}\n", t.id, t.name);
        if let Some(g) = &t.group {
            s += &format!("put {} {}\n", t.id, g);
        }
        let n = b.cards.iter().filter(|c| c.topic == t.id).count();
        match level(&t.id) {
            0 => s += &format!("# topic {}: {n} cards, all omitted here (read them with board_read)\n", t.id),
            1 => s += &format!("# topic {}: {n} cards, titles only here (read the contents with board_read)\n", t.id),
            _ => {}
        }
    }
    for c in &b.cards {
        let lv = level(&c.topic);
        if lv == 0 {
            continue;
        }
        s += &format!("card {} {} {} {}x{} {}\n", c.id, c.kind_name(), c.topic, c.w, c.h, c.title);
        if lv == 1 {
            continue;
        }
        for (f, v) in &c.fields {
            s += &format!("set {} {} {}\n", c.id, f, v);
        }
        for (i, cells) in &c.items {
            s += &format!("add {} {} {}\n", c.id, i, join_cells(cells));
        }
        if let Some((col, row)) = c.grid {
            s += &format!("move {} {} {}\n", c.id, col, row);
        }
        if c.pinned {
            s += &format!("pin {}\n", c.id);
        }
    }
    s
}

/// Write one topic in full: its `topic` line and its cards, without groups, named values or notes.
/// None when there is no such topic.
pub fn serialize_topic(b: &Board, topic: &str) -> Option<String> {
    if !b.topics.iter().any(|t| t.id == topic) {
        return None;
    }
    let text = serialize_with(b, &|t| if t == topic { 2 } else { 0 });
    let keep = |l: &&str| {
        !l.starts_with("group ") && !l.starts_with("put ") && !l.starts_with("let ") && !l.starts_with('#') && (!l.starts_with("topic ") || l.split_whitespace().nth(1) == Some(topic))
    };
    Some(text.lines().filter(keep).map(|l| format!("{l}\n")).collect())
}

pub enum Chunk {
    /// A finished line.
    Line(String),
    /// The current line, not finished yet (what has arrived so far).
    Partial(String),
}

/// Cuts a token stream into lines.
#[derive(Default)]
pub struct LineStream {
    buf: String,
    started: bool,
}

impl LineStream {
    pub fn feed(&mut self, delta: &str) -> Vec<Chunk> {
        self.buf.push_str(delta);
        // One U+FEFF at the very start of a stream or file is a byte order mark, not text (SPEC.md 10.2).
        if !self.started && !self.buf.is_empty() {
            self.started = true;
            if self.buf.starts_with('\u{feff}') {
                self.buf.remove(0);
            }
        }
        let mut out = Vec::new();
        while let Some(i) = self.buf.find('\n') {
            let line: String = self.buf.drain(..=i).collect();
            out.push(Chunk::Line(line.trim_end().to_string()));
        }
        if !self.buf.is_empty() {
            out.push(Chunk::Partial(self.buf.clone()));
        }
        out
    }
    pub fn finish(&mut self) -> Option<String> {
        let rest = std::mem::take(&mut self.buf);
        if rest.trim().is_empty() { None } else { Some(rest) }
    }
}

/// When the unfinished line is writing a long text: (card id, field, value so far).
/// For `say` the card id is empty.
pub fn partial_text(partial: &str) -> Option<(String, String, String)> {
    let (cmd, rest) = split1(partial);
    match cmd {
        "say" => Some((String::new(), "say".into(), rest.to_string())),
        "set" => {
            let (id, rest) = split1(rest);
            let (field, value) = split1(rest);
            if field == "text" && !value.is_empty() {
                Some((id.to_string(), field.to_string(), value.to_string()))
            } else {
                None
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::{Author, Board};

    fn run(b: &mut Board, src: &str, by: Author) -> Vec<Reject> {
        let mut errs = Vec::new();
        for l in src.lines() {
            match parse(l) {
                Ok(Some(op)) => {
                    if let Err(e) = b.apply(op, by) {
                        errs.push(e);
                    }
                }
                Ok(None) => {}
                Err(e) => errs.push(e),
            }
        }
        errs
    }

    #[test]
    fn roundtrip() {
        let mut b = Board::default();
        let errs = run(
            &mut b,
            "topic t1 여행\ncard k1 table t1 4x3 항공편 비교\nset k1 cols 항공사 | 가격\nadd k1 r1 A | 100\nadd k1 r2 B | 120\ncard k2 status t1 준비\nset k2 state run\nsay 정리했어요",
            Author::Ai,
        );
        assert!(errs.is_empty(), "{errs:?}");
        let text = serialize(&b);
        let mut b2 = Board::default();
        assert!(run(&mut b2, &text, Author::Restore).is_empty());
        assert_eq!(serialize(&b2), text);
        assert_eq!(b.card("k2").unwrap().w, 2); // default size
    }

    #[test]
    fn version_header() {
        assert_eq!(header(), format!("# patet {VERSION}"));
        assert_eq!(declared_version("# patet 0.1"), Some("0.1"));
        assert_eq!(declared_version("  #patet 0.2  "), Some("0.2"));
        assert_eq!(declared_version("# kite-protocol 0.3"), Some("0.3"));
        assert_eq!(declared_version("# patetX 0.1"), None);
        assert_eq!(declared_version("# note"), None);
        assert_eq!(declared_version("say # patet 0.1"), None);
        assert!(can_read("0.1") && can_read("0.9") && !can_read("1.0") && !can_read("x"));
        // The header is a comment: it changes no board.
        assert!(matches!(parse(&header()), Ok(None)));
    }

    #[test]
    fn rejects() {
        let mut b = Board::default();
        let errs = run(
            &mut b,
            "card k1 note t9 제목\ntopic t1 a\ncard k1 note t1 제목\ncard k1 note t1 또\nset k1 state ok\nadd k1 i1 x\nfoo bar\nset k9 text x",
            Author::Ai,
        );
        let codes: Vec<&str> = errs.iter().map(|e| e.code).collect();
        assert_eq!(codes, ["no-such-topic", "exists", "unknown-field", "no-items", "unknown-verb", "no-such-card"]);
        assert_eq!(b.cards.len(), 1);
    }

    #[test]
    fn user_pin_wins() {
        let mut b = Board::default();
        run(&mut b, "topic t a\ncard k note t x", Author::Ai);
        assert!(run(&mut b, "move k 3 2\nsize k 5x4", Author::User).is_empty());
        assert_eq!(run(&mut b, "move k 0 0\nsize k 1x1", Author::Ai).len(), 2);
        let c = b.card("k").unwrap();
        assert_eq!((c.grid, c.w, c.h, c.pinned), (Some((3, 2)), 5, 4, true));
    }

    #[test]
    fn limits_clip_and_note() {
        let mut b = Board::default();
        let long = "가".repeat(300);
        run(&mut b, &format!("topic t a\ncard k note t x\nset k text {long}"), Author::Ai);
        assert_eq!(b.card("k").unwrap().field("text").chars().count(), 240);
        assert_eq!(b.notes, ["clipped k.text 240"]);
    }

    #[test]
    fn a_pipe_inside_a_cell() {
        assert_eq!(split_cells("a | b\\|c | d"), ["a", "b|c", "d"]);
        assert_eq!(split_cells("C:\\dir\\ | x"), ["C:\\dir\\", "x"]);
        assert_eq!(split_cells(" | "), ["", ""]);
        assert_eq!(join_cells(&["a|b".into(), "c".into()]), "a\\|b | c");
        let mut b = Board::default();
        assert!(run(&mut b, "topic t T\ncard k table t Shell\nadd k r1 ls \\| wc -l | counts files", Author::Ai).is_empty());
        assert_eq!(b.card("k").unwrap().items[0].1, ["ls | wc -l", "counts files"]);
        let text = serialize(&b);
        assert!(text.contains("add k r1 ls \\| wc -l | counts files\n"), "{text}");
        let mut again = Board::default();
        assert!(run(&mut again, &text, Author::Restore).is_empty());
        assert_eq!(serialize(&again), text);
    }

    #[test]
    fn one_topic() {
        let mut b = Board::default();
        run(&mut b, "let n 3\ngroup g G\ntopic a A\nput a g\ntopic b B\ncard k1 note a One\nset k1 text x\ncard k2 note b Two", Author::Ai);
        assert_eq!(serialize_topic(&b, "a").as_deref(), Some("topic a A\ncard k1 note a 3x2 One\nset k1 text x\n"));
        assert_eq!(serialize_topic(&b, "zz"), None);
    }

    #[test]
    fn settled_forms() {
        use crate::core::is_number;
        for s in ["0", "12", "12.", "12.5", ".5", "+7", "-.5e-3", "1e3", "1E+3"] {
            assert!(is_number(s), "{s}");
        }
        for s in ["", ".", "+", "e3", "1e", "1e+", "0x10", "inf", "nan", "Infinity", "1e400", "1 000", "1_000", "١٢", "12%", " 1"] {
            assert!(!is_number(s), "{s}");
        }
        assert_eq!(parse_size("4x2"), Some((4, 2)));
        assert_eq!(parse_size("004X2"), Some((4, 2)));
        assert_eq!(parse_size("300x99999999999999999999"), Some((255, 255)));
        for s in ["+4x2", "-4x2", "4x", "x2", "4x2x3", "4.5x2", "４x2"] {
            assert_eq!(parse_size(s), None, "{s}");
        }
        assert_eq!((digits("0", MAX_CELL), digits("0009999", MAX_CELL)), (Some(0), Some(9999)));
        for s in ["10000", "-1", "+1", "1.0", "", "３"] {
            assert_eq!(digits(s, MAX_CELL), None, "{s}");
        }
        // A placed card read back with the restore author is placed, not pinned.
        let mut b = Board::default();
        run(&mut b, "topic t T\ncard k note t K\nmove k 2 1", Author::Ai);
        let mut again = Board::default();
        assert!(run(&mut again, &serialize(&b), Author::Restore).is_empty());
        assert_eq!(serialize(&again), serialize(&b));
        // The byte order mark of a file is dropped, once.
        let mut s = LineStream::default();
        let lines: Vec<String> = s.feed("\u{feff}topic t T\n\u{feff}topic u U\n").into_iter().filter_map(|c| if let Chunk::Line(l) = c { Some(l) } else { None }).collect();
        assert_eq!(lines, ["topic t T", "\u{feff}topic u U"]);
    }

    #[test]
    fn streaming() {
        let mut s = LineStream::default();
        let mut lines = Vec::new();
        let mut last_partial = String::new();
        for d in ["topic t 가\nset k te", "xt 안녕", "하세요\nsay 끝"] {
            for c in s.feed(d) {
                match c {
                    Chunk::Line(l) => lines.push(l),
                    Chunk::Partial(p) => last_partial = p,
                }
            }
        }
        assert_eq!(lines, vec!["topic t 가", "set k text 안녕하세요"]);
        assert_eq!(partial_text(&last_partial), Some((String::new(), "say".into(), "끝".into())));
        assert_eq!(s.finish().as_deref(), Some("say 끝"));
    }
}
