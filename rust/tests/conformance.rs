//! Runs every case in protocol/conformance against this implementation (the format is in its README).

use kite_protocol::core::{Author, Board};
use kite_protocol::lang;

/// `<N c>` stands for the character `c` repeated N times.
fn expand(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(a) = rest.find('<') {
        let Some(b) = rest[a..].find('>').map(|i| a + i) else { break };
        let inner = &rest[a + 1..b];
        let repeat = inner.split_once(' ').and_then(|(n, c)| Some((n.parse::<usize>().ok()?, c))).filter(|(_, c)| c.chars().count() == 1);
        out += &rest[..a];
        match repeat {
            Some((n, c)) => out += &c.repeat(n),
            None => out += &rest[a..=b],
        }
        rest = &rest[b + 1..];
    }
    out + rest
}

fn run_case(name: &str, text: &str) {
    let text = text.replace("\r\n", "\n");
    let (script, want_board) = text.split_once("\nboard:\n").unwrap_or_else(|| panic!("{name}: no board: section"));
    let mut board = Board::default();
    let mut lines = script.lines().enumerate().peekable();
    while let Some((n, line)) = lines.next() {
        let (by, op) = if let Some(op) = line.strip_prefix("agent:") {
            (Author::Ai, op)
        } else if let Some(op) = line.strip_prefix("user:") {
            (Author::User, op)
        } else if line.starts_with('#') || line.trim().is_empty() {
            continue;
        } else {
            panic!("{name}:{}: not a case line: {line}", n + 1);
        };
        // The op is taken as written (a leading space separates it from the author), so cases can test trimming.
        let op = expand(op.strip_prefix(' ').unwrap_or(op));
        let want = lines.next().map(|(_, l)| l.trim().to_string()).and_then(|l| l.strip_prefix("-> ").map(str::to_string)).unwrap_or_else(|| panic!("{name}:{}: no verdict after: {line}", n + 1));
        let got = match lang::parse(&op) {
            Ok(None) => "skip".to_string(),
            Err(e) => format!("err {}", e.code),
            Ok(Some(parsed)) => match board.apply(parsed, by) {
                Err(e) => format!("err {}", e.code),
                Ok(()) => {
                    let notes: Vec<String> = board.notes.drain(..).collect();
                    if notes.is_empty() { "ok".to_string() } else { format!("ok {}", notes.join("; ")) }
                }
            },
        };
        assert_eq!(got, want, "{name}:{}: {line}", n + 1);
    }
    let want_board = expand(want_board);
    let got_board = lang::serialize(&board);
    // Trailing spaces are not compared (an empty title leaves one, and editors strip them from case files).
    let tidy = |s: &str| s.lines().map(str::trim_end).collect::<Vec<_>>().join("\n").trim_end().to_string();
    assert_eq!(tidy(&got_board), tidy(&want_board), "{name}: the board at the end");
    // What was written back rebuilds the same board when the user replays it.
    let mut again = Board::default();
    for l in got_board.lines() {
        again.apply(lang::parse(l).unwrap().unwrap(), Author::User).unwrap_or_else(|e| panic!("{name}: replay of '{l}': {e}"));
    }
    assert_eq!(lang::serialize(&again), got_board, "{name}: replaying the board");
}

#[test]
fn conformance_cases() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../conformance");
    let mut ran = 0;
    let mut files: Vec<_> = std::fs::read_dir(&dir).expect("protocol/conformance").flatten().map(|e| e.path()).filter(|p| p.extension().map(|x| x == "txt").unwrap_or(false)).collect();
    files.sort();
    for path in files {
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        run_case(&name, &std::fs::read_to_string(&path).unwrap());
        ran += 1;
    }
    assert!(ran >= 6, "expected the conformance cases, found {ran}");
}

#[test]
fn examples_apply_without_a_rejection() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../examples");
    let mut ran = 0;
    for path in std::fs::read_dir(&dir).expect("protocol/examples").flatten().map(|e| e.path()).filter(|p| p.extension().map(|x| x == "ops").unwrap_or(false)) {
        let mut board = Board::default();
        for (n, l) in std::fs::read_to_string(&path).unwrap().lines().enumerate() {
            let Some((who, op)) = l.split_once('\t') else { continue };
            if who == "T" {
                continue;
            }
            let by = if who == "U" { Author::User } else { Author::Ai };
            if let Some(op) = lang::parse(op).unwrap_or_else(|e| panic!("{}:{}: {e}", path.display(), n + 1)) {
                board.apply(op, by).unwrap_or_else(|e| panic!("{}:{}: {e}", path.display(), n + 1));
            }
        }
        assert!(board.notes.is_empty(), "{}: {:?}", path.display(), board.notes);
        ran += 1;
    }
    assert!(ran >= 4);
}
