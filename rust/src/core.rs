//! The board and its ops. Every change, whoever makes it (a model, the user, a rule), is one [`Op`],
//! and [`Board::apply`] checks it before it takes effect.

use std::collections::BTreeMap;
use std::fmt;

/// Why an op was not applied. `code` is stable and meant for programs; `message` is English and meant for
/// whoever wrote the line (a model reads it and fixes its next line). The codes are listed in SPEC.md.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Reject {
    pub code: &'static str,
    pub message: String,
}

impl Reject {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Reject { code, message: message.into() }
    }
}

impl fmt::Display for Reject {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} {}", self.code, self.message)
    }
}

impl std::error::Error for Reject {}

fn no(code: &'static str, message: impl Into<String>) -> Reject {
    Reject::new(code, message)
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Note,
    Status,
    Progress,
    Decision,
    /// Asks the user for values (a date, a name, a number): boxes to fill in and send.
    Input,
    Checklist,
    Table,
    Metric,
    Chart,
    Timeline,
    /// Stops on a map, the shape of the way between them, distance and time per leg.
    Route,
    /// Lines, arrows, boxes, circles and text drawn directly by the writer.
    Draw,
    /// A picture file or picture address shown as it is.
    Image,
    /// A web page or an HTML file shown as it is.
    Web,
    /// A thing with named fields of the writer's choosing (an invoice, a contact, a ticket), and optional rows.
    /// Also what a card of an extension kind (`x-...`) is to a renderer that does not draw that kind itself.
    Record,
    /// A document, file or link that lives outside the board: shown by name with a short summary.
    Doc,
}

/// One registered card type. Everything about a type lives here: its name, default size, fields and their
/// length limits, the shape of its items, and the description given to a model. The table a model reads is
/// built from this list, so adding or changing a type needs no separate prompt edit.
pub struct Part {
    pub kind: Kind,
    pub name: &'static str,
    /// Default size (columns, rows).
    pub size: (u8, u8),
    /// What the type is for. A model reads this when choosing.
    pub purpose: &'static str,
    /// Fields: (name, length limit, description for the model). An empty description marks a field the
    /// renderer sets itself (the user's choice, the sent mark).
    pub fields: &'static [(&'static str, usize, &'static str)],
    /// The shape of an item. Empty means the type takes no items.
    pub items: &'static str,
}

/// The registered card types, in the order they are introduced to a model.
pub const PARTS: &[Part] = &[
    Part { kind: Kind::Status, name: "status", size: (2, 1), purpose: "one state", fields: &[("state", 8, "state: ok/run/wait/fail/idle"), ("text", 80, "text(80)")], items: "" },
    Part {
        kind: Kind::Metric,
        name: "metric",
        size: (2, 2),
        purpose: "one number",
        fields: &[("value", 14, "value(14)"), ("unit", 8, "unit(8)"), ("delta", 14, "delta(14, colored when it starts with + or -)"), ("text", 60, "text(60)")],
        items: "",
    },
    Part {
        kind: Kind::Chart,
        name: "chart",
        size: (4, 3),
        purpose: "quantities as a picture: comparison (bar), change over time (line), shares (donut)",
        fields: &[("unit", 8, "unit(8)"), ("form", 8, "form: bar(default)/line/donut")],
        items: "name | number",
    },
    Part {
        kind: Kind::Route,
        name: "route",
        size: (6, 5),
        purpose: "a route: where the stops are, the shape of the way, distance and time per leg",
        fields: &[("total", 40, "total(whole distance and time, 40)"), ("text", 80, "text(80)")],
        items: "name | lat,lon | distance and time to the next stop",
    },
    Part {
        kind: Kind::Draw,
        name: "draw",
        size: (5, 4),
        purpose: "a drawing no other type can show: structure, flow, seating, relations",
        fields: &[("text", 80, "text(80)")],
        items: "shape | coordinates | text | color | size",
    },
    Part { kind: Kind::Image, name: "image", size: (4, 3), purpose: "a picture file or picture address shown as it is: a photo, a capture, a generated image", fields: &[("src", 600, "src: absolute path of a picture file, or the web address of a picture"), ("text", 80, "text(caption, 80)")], items: "" },
    Part { kind: Kind::Table, name: "table", size: (4, 3), purpose: "a comparison or a list with several attributes", fields: &[("cols", 200, "cols: column | column ...")], items: "cell | cell ... (up to 6 cells)" },
    Part { kind: Kind::Progress, name: "progress", size: (3, 3), purpose: "work in progress", fields: &[("pct", 3, "pct(0-100)"), ("text", 60, "text(60)")], items: "done/run/todo/fail | step name" },
    Part { kind: Kind::Checklist, name: "checklist", size: (3, 3), purpose: "things to do (the user can tick them)", fields: &[], items: "done/todo | text" },
    Part {
        kind: Kind::Decision,
        name: "decision",
        size: (3, 3),
        purpose: "something the user has to decide (pick one)",
        fields: &[("text", 120, "text(the question, 120)"), ("multi", 8, "multi: yes when several may be picked"), ("tone", 8, "tone: danger when the choice cannot be undone"), ("chosen", 120, "")],
        items: "option name | one-line description",
    },
    Part {
        kind: Kind::Input,
        name: "input",
        size: (3, 3),
        purpose: "values the user has to give (fill in): a date, a name, a number, an address",
        fields: &[("text", 120, "text(what is asked and why, 120)"), ("sent", 8, "")],
        items: "box name (end it with * when it must be filled) | hint (an example) or the kind of box: date / time / number / slider 0~100 unit / choice A / B / C",
    },
    Part { kind: Kind::Timeline, name: "timeline", size: (3, 3), purpose: "things in order of time", fields: &[], items: "when | text | done/run/todo (optional)" },
    Part { kind: Kind::Note, name: "note", size: (3, 2), purpose: "a short text that fits none of the above", fields: &[("text", 240, "text(240)")], items: "" },
    Part { kind: Kind::Web, name: "web", size: (6, 5), purpose: "a web page or an HTML file shown as it is, in a small browser", fields: &[("url", 600, "url: a web address, or the absolute path of a file on this computer")], items: "" },
    Part {
        kind: Kind::Record,
        name: "record",
        size: (3, 3),
        purpose: "one thing with named properties that no other type fits: an invoice, a contact, a ticket, a setting",
        fields: &[("text", 240, "any field name of your choosing, shown as label and value (80 each, up to 12), text(240)"), ("cols", 200, "cols: column | column ... (when it has rows)")],
        items: "cell | cell ... (up to 6 cells, optional)",
    },
    Part {
        kind: Kind::Doc,
        name: "doc",
        size: (3, 2),
        purpose: "a document, file or link that is too long for the board: shown by name with a summary, opened by the user",
        fields: &[("src", 600, "src: absolute path of the file, or a web address"), ("text", 240, "text(what it is and what it says, 240)")],
        items: "",
    },
];

/// The card types this implementation knows, by name, in the order of [`PARTS`].
pub fn kind_names() -> Vec<&'static str> {
    PARTS.iter().map(|p| p.name).collect()
}

/// Is this the name of an extension kind? `x-` and then an id. Every renderer accepts a card of an extension
/// kind; one that does not draw that kind itself treats the card as a `record`.
pub fn is_extension_kind(name: &str) -> bool {
    name.strip_prefix("x-").map(valid_id).unwrap_or(false) && chars(name) <= ID_LIMIT
}

/// The card type table for a model (Markdown), built from [`PARTS`].
pub fn parts_table() -> String {
    let mut t = String::from("| Type | Use | Fields (length limit) | Item | Default size |\n|---|---|---|---|---|\n");
    for p in PARTS {
        let fields: Vec<&str> = p.fields.iter().map(|f| f.2).filter(|d| !d.is_empty()).collect();
        let cell = |s: &str| if s.is_empty() { "none".to_string() } else { s.replace('|', "\\|") };
        t += &format!("| {} | {} | {} | {} | {}x{} |\n", p.name, p.purpose, cell(&fields.join(", ")), cell(p.items), p.size.0, p.size.1);
    }
    t
}

impl Kind {
    fn part(self) -> &'static Part {
        PARTS.iter().find(|p| p.kind == self).expect("every kind is registered in PARTS")
    }
    pub fn parse(s: &str) -> Option<Kind> {
        PARTS.iter().find(|p| p.name == s).map(|p| p.kind)
    }
    pub fn name(self) -> &'static str {
        self.part().name
    }
    pub fn default_size(self) -> (u8, u8) {
        self.part().size
    }
    /// Does this card wait for the user's answer? (A renderer brings such a card to the user.)
    pub fn asks(self) -> bool {
        matches!(self, Kind::Decision | Kind::Input)
    }
    pub fn has_items(self) -> bool {
        !self.part().items.is_empty()
    }
    /// Length limit of a field, or None when this type has no such field.
    /// Keeping the room for text small is the central constraint of the protocol.
    pub fn field_limit(self, field: &str) -> Option<usize> {
        if field == "title" {
            return Some(TITLE_LIMIT);
        }
        if let Some(f) = self.part().fields.iter().find(|f| f.0 == field) {
            return Some(f.1);
        }
        // A record takes any field name that is a valid id.
        (self == Kind::Record && valid_id(field)).then_some(RECORD_FIELD_LIMIT)
    }
}

pub const MAX_ITEMS: usize = 24;
/// A drawing takes one item per shape, so it takes more.
pub const MAX_DRAW_ITEMS: usize = 80;
pub const MAX_CELLS: usize = 6;
pub const CELL_LIMIT: usize = 60;
pub const MAX_W: u8 = 8;
pub const MAX_H: u8 = 8;
pub const ID_LIMIT: usize = 24;
pub const TITLE_LIMIT: usize = 40;
pub const TOPIC_NAME_LIMIT: usize = 24;
pub const GROUP_NAME_LIMIT: usize = 16;
pub const MAX_GROUPS: usize = 8;
pub const MAX_VARS: usize = 64;
pub const SAY_LIMIT: usize = 80;
/// A field of a record that the writer named itself.
pub const RECORD_FIELD_LIMIT: usize = 80;
/// Fields of a record, not counting the title.
pub const MAX_RECORD_FIELDS: usize = 12;

/// Who made a change. The protocol calls these "agent" and "user".
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Author {
    /// A model, or a program writing on its behalf.
    Ai,
    User,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Op {
    Topic { id: String, name: String },
    /// Create a group, or rename it.
    Group { id: String, name: String },
    /// Move a card to another topic (used when merging topics).
    Mv { card: String, topic: String },
    /// Place a topic in a group.
    Put { topic: String, group: String },
    Card { id: String, kind: String, topic: String, size: Option<(u8, u8)>, title: String },
    Set { id: String, field: String, value: String },
    Add { id: String, item: String, cells: Vec<String> },
    Upd { id: String, item: String, cells: Vec<String> },
    Del { id: String, item: Option<String> },
    Size { id: String, w: u8, h: u8 },
    Move { id: String, col: i32, row: i32 },
    Pin { id: String, on: bool },
    Focus { id: String },
    Say { text: String },
    /// Set a named value. `{name}` in a card's text shows this value (an empty value removes the name).
    Let { name: String, value: String },
    /// Shelve a topic with its cards / bring it back.
    Archive { topic: String },
    Restore { topic: String },
}

/// A group: one level above topics ("Work", "Home").
#[derive(Clone, Debug)]
pub struct Group {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug)]
pub struct Topic {
    pub id: String,
    pub name: String,
    /// The group this topic is in, if any.
    pub group: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Card {
    pub id: String,
    pub kind: Kind,
    /// The name of the extension kind (`x-...`) when the card was created as one. Its `kind` is then `Record`.
    pub ext: Option<String>,
    pub topic: String,
    pub title: String,
    pub fields: BTreeMap<String, String>,
    pub items: Vec<(String, Vec<String>)>,
    pub w: u8,
    pub h: u8,
    /// Explicit position (grid cell). None leaves placement to the renderer.
    pub grid: Option<(i32, i32)>,
    /// The user moved or resized this card. An agent can no longer change its position or size.
    pub pinned: bool,
    /// Grows by one on every change. A renderer uses it to highlight what changed.
    pub rev: u64,
    /// A value still streaming in, before its line has ended: (field, text so far).
    pub live: Option<(String, String)>,
}

impl Card {
    /// The kind as the writer named it: an extension kind keeps its own name.
    pub fn kind_name(&self) -> &str {
        self.ext.as_deref().unwrap_or(self.kind.name())
    }
    pub fn field(&self, name: &str) -> &str {
        if let Some((f, v)) = &self.live {
            if f == name {
                return v;
            }
        }
        self.fields.get(name).map(|s| s.as_str()).unwrap_or("")
    }
}

/// A shelved topic: off the board, but kept with its cards so it can come back.
#[derive(Clone, Debug)]
pub struct Shelved {
    pub topic: Topic,
    pub cards: Vec<Card>,
}

#[derive(Default)]
pub struct Board {
    pub groups: Vec<Group>,
    pub topics: Vec<Topic>,
    pub cards: Vec<Card>,
    /// The shelf: finished or long-untouched topics.
    pub shelf: Vec<Shelved>,
    /// Named values. Several cards can show the same value; changing it here changes them all.
    pub vars: BTreeMap<String, String>,
    pub say: String,
    pub focus: Option<String>,
    /// Notes for the writer about ops that were applied with a change, such as clipped text.
    /// Each is `clipped <what> <limit>`. Whoever relays verdicts to the writer drains this.
    pub notes: Vec<String>,
}

fn chars(s: &str) -> usize {
    s.chars().count()
}

fn clip(s: &str, limit: usize) -> String {
    if chars(s) <= limit {
        s.to_string()
    } else {
        let mut t: String = s.chars().take(limit.saturating_sub(1)).collect();
        t.push('…');
        t
    }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && chars(id) <= ID_LIMIT && id.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

impl Board {
    pub fn card(&self, id: &str) -> Option<&Card> {
        self.cards.iter().find(|c| c.id == id)
    }
    fn card_mut(&mut self, id: &str) -> Result<&mut Card, Reject> {
        self.cards.iter_mut().find(|c| c.id == id).ok_or_else(|| no("no-such-card", format!("no card '{id}'")))
    }

    /// Check one op and apply it. A rejected op changes nothing.
    pub fn apply(&mut self, op: Op, by: Author) -> Result<(), Reject> {
        match op {
            Op::Topic { id, name } => {
                if !valid_id(&id) {
                    return Err(no("bad-id", format!("topic id '{id}' is not valid (1 to {ID_LIMIT} letters, digits, _ or -)")));
                }
                if self.shelf.iter().any(|s| s.topic.id == id) {
                    return Err(no("shelved", format!("topic '{id}' is on the shelf; bring it back with: restore {id}")));
                }
                let name = clip(if name.is_empty() { &id } else { &name }, TOPIC_NAME_LIMIT);
                match self.topics.iter_mut().find(|t| t.id == id) {
                    Some(t) => t.name = name,
                    None => self.topics.push(Topic { id, name, group: None }),
                }
            }
            Op::Group { id, name } => {
                if !valid_id(&id) {
                    return Err(no("bad-id", format!("group id '{id}' is not valid (1 to {ID_LIMIT} letters, digits, _ or -)")));
                }
                if self.topics.iter().any(|t| t.id == id) || self.card(&id).is_some() {
                    return Err(no("id-in-use", format!("'{id}' is already the id of a topic or a card")));
                }
                let name = clip(if name.is_empty() { &id } else { &name }, GROUP_NAME_LIMIT);
                match self.groups.iter_mut().find(|g| g.id == id) {
                    Some(g) => g.name = name,
                    None => {
                        if self.groups.len() >= MAX_GROUPS {
                            return Err(no("limit", format!("at most {MAX_GROUPS} groups; make the groups broader")));
                        }
                        self.groups.push(Group { id, name });
                    }
                }
            }
            Op::Mv { card, topic } => {
                if !self.topics.iter().any(|t| t.id == topic) {
                    return Err(no("no-such-topic", format!("no topic '{topic}'")));
                }
                let c = self.card_mut(&card)?;
                c.topic = topic;
                c.grid = None; // placed again in the new topic
                c.pinned = false;
                c.rev += 1;
            }
            Op::Put { topic, group } => {
                if !self.groups.iter().any(|g| g.id == group) {
                    return Err(no("no-such-group", format!("no group '{group}'; create it first with: group {group} <name>")));
                }
                let t = self.topics.iter_mut().find(|t| t.id == topic).ok_or_else(|| no("no-such-topic", format!("no topic '{topic}'")))?;
                t.group = Some(group);
            }
            Op::Card { id, kind, topic, size, title } => {
                if self.shelf.iter().any(|s| s.cards.iter().any(|c| c.id == id)) {
                    return Err(no("shelved", format!("card id '{id}' belongs to a card on the shelf; use another id")));
                }
                if !valid_id(&id) {
                    return Err(no("bad-id", format!("card id '{id}' is not valid (1 to {ID_LIMIT} letters, digits, _ or -)")));
                }
                if self.card(&id).is_some() {
                    return Err(no("exists", format!("card '{id}' already exists; change it with set/add/upd instead of creating it again")));
                }
                let (k, ext) = match Kind::parse(&kind) {
                    Some(k) => (k, None),
                    None if is_extension_kind(&kind) => (Kind::Record, Some(kind.clone())),
                    None => return Err(no("unknown-kind", format!("no card type '{kind}'"))),
                };
                if !self.topics.iter().any(|t| t.id == topic) {
                    return Err(no("no-such-topic", format!("no topic '{topic}'; create it first with: topic {topic} <name>")));
                }
                let (w, h) = size.unwrap_or(k.default_size());
                if chars(&title) > TITLE_LIMIT {
                    self.notes.push(format!("clipped {id}.title {TITLE_LIMIT}"));
                }
                self.cards.push(Card {
                    id,
                    kind: k,
                    ext,
                    topic,
                    title: clip(&title, TITLE_LIMIT),
                    fields: BTreeMap::new(),
                    items: Vec::new(),
                    w: w.clamp(1, MAX_W),
                    h: h.clamp(1, MAX_H),
                    grid: None,
                    pinned: false,
                    rev: 1,
                    live: None,
                });
            }
            Op::Set { id, field, value } => {
                let mut note = None;
                let c = self.card_mut(&id)?;
                let limit = c.kind.field_limit(&field).ok_or_else(|| no("unknown-field", format!("{} has no field '{field}'", c.kind_name())))?;
                if c.kind == Kind::Record && field != "title" && !c.fields.contains_key(&field) && c.fields.len() >= MAX_RECORD_FIELDS {
                    return Err(no("limit", format!("card '{id}' already has {MAX_RECORD_FIELDS} fields")));
                }
                // The user's answers are the user's: an agent does not write them.
                if by == Author::Ai && matches!((c.kind, field.as_str()), (Kind::Decision, "chosen") | (Kind::Input, "sent")) {
                    return Err(no("user-only", format!("'{field}' is the user's answer; it is set when the user picks or sends, never by an agent")));
                }
                if c.kind == Kind::Input && field == "sent" && value != "yes" {
                    return Err(no("bad-value", format!("input.sent is yes (got '{value}')")));
                }
                match (c.kind, field.as_str()) {
                    (Kind::Status, "state") if !["ok", "run", "wait", "fail", "idle"].contains(&value.as_str()) => {
                        return Err(no("bad-value", format!("status.state is one of ok|run|wait|fail|idle (got '{value}')")));
                    }
                    (Kind::Progress, "pct") if value.parse::<u8>().map(|v| v > 100).unwrap_or(true) => {
                        return Err(no("bad-value", format!("progress.pct is a whole number from 0 to 100 (got '{value}')")));
                    }
                    (Kind::Decision, "multi") if !["yes", "no"].contains(&value.as_str()) => {
                        return Err(no("bad-value", format!("decision.multi is yes or no (got '{value}')")));
                    }
                    (Kind::Decision, "tone") if !["normal", "danger"].contains(&value.as_str()) => {
                        return Err(no("bad-value", format!("decision.tone is normal or danger (got '{value}')")));
                    }
                    _ => {}
                }
                if chars(&value) > limit {
                    note = Some(format!("clipped {id}.{field} {limit}"));
                }
                let v = clip(&value, limit);
                if field == "title" {
                    c.title = v;
                } else {
                    c.fields.insert(field, v);
                }
                c.live = None;
                c.rev += 1;
                self.notes.extend(note);
            }
            Op::Add { id, item, cells } => self.put_item(&id, &item, cells, false, by)?,
            Op::Upd { id, item, cells } => self.put_item(&id, &item, cells, true, by)?,
            Op::Del { id, item: Some(item) } => {
                let c = self.card_mut(&id)?;
                let n = c.items.len();
                c.items.retain(|(i, _)| *i != item);
                if c.items.len() == n {
                    return Err(no("no-such-item", format!("card '{id}' has no item '{item}'")));
                }
                c.rev += 1;
            }
            Op::Del { id, item: None } => {
                let n = self.cards.len();
                self.cards.retain(|c| c.id != id);
                if self.cards.len() == n {
                    // Not a card: then a topic (only when empty), then a group.
                    if self.topics.iter().any(|t| t.id == id) {
                        if self.cards.iter().any(|c| c.topic == id) {
                            return Err(no("not-empty", format!("topic '{id}' still has cards")));
                        }
                        self.topics.retain(|t| t.id != id);
                    } else if self.groups.iter().any(|g| g.id == id) {
                        // Topics of a deleted group go back to having no group.
                        self.groups.retain(|g| g.id != id);
                        for t in self.topics.iter_mut().filter(|t| t.group.as_deref() == Some(id.as_str())) {
                            t.group = None;
                        }
                    } else {
                        return Err(no("not-found", format!("nothing has the id '{id}'")));
                    }
                }
                if self.focus.as_deref() == Some(id.as_str()) {
                    self.focus = None;
                }
            }
            Op::Size { id, w, h } => {
                let c = self.card_mut(&id)?;
                if by == Author::Ai && c.pinned {
                    return Err(no("pinned", format!("the user pinned '{id}'; its size cannot be changed")));
                }
                c.w = w.clamp(1, MAX_W);
                c.h = h.clamp(1, MAX_H);
                if by == Author::User {
                    c.pinned = true;
                }
                c.rev += 1;
            }
            Op::Move { id, col, row } => {
                let c = self.card_mut(&id)?;
                if by == Author::Ai && c.pinned {
                    return Err(no("pinned", format!("the user pinned '{id}'; it cannot be moved")));
                }
                c.grid = Some((col.max(0), row.max(0)));
                if by == Author::User {
                    c.pinned = true;
                }
            }
            Op::Pin { id, on } => {
                if by == Author::Ai {
                    return Err(no("user-only", "only the user can pin or unpin"));
                }
                let c = self.card_mut(&id)?;
                c.pinned = on;
                if !on {
                    c.grid = None;
                }
            }
            Op::Focus { id } => {
                self.card_mut(&id)?;
                self.focus = Some(id);
            }
            Op::Let { name, value } => {
                if !valid_id(&name) {
                    return Err(no("bad-id", format!("value name '{name}' is not valid (1 to {ID_LIMIT} letters, digits, _ or -)")));
                }
                if value.trim().is_empty() {
                    self.vars.remove(&name);
                } else {
                    if !self.vars.contains_key(&name) && self.vars.len() >= MAX_VARS {
                        return Err(no("limit", format!("at most {MAX_VARS} named values")));
                    }
                    if chars(&value) > CELL_LIMIT {
                        self.notes.push(format!("clipped let.{name} {CELL_LIMIT}"));
                    }
                    self.vars.insert(name, clip(value.trim(), CELL_LIMIT));
                }
            }
            Op::Archive { topic } => {
                let at = self.topics.iter().position(|t| t.id == topic).ok_or_else(|| no("no-such-topic", format!("no topic '{topic}'")))?;
                let t = self.topics.remove(at);
                let (gone, kept): (Vec<Card>, Vec<Card>) = std::mem::take(&mut self.cards).into_iter().partition(|c| c.topic == topic);
                self.cards = kept;
                if self.focus.as_ref().map(|f| gone.iter().any(|c| &c.id == f)).unwrap_or(false) {
                    self.focus = None;
                }
                self.shelf.push(Shelved { topic: t, cards: gone });
            }
            Op::Restore { topic } => {
                let at = self.shelf.iter().position(|s| s.topic.id == topic).ok_or_else(|| no("not-shelved", format!("no topic '{topic}' on the shelf")))?;
                let mut s = self.shelf.remove(at);
                // The group may have gone while the topic was on the shelf.
                if s.topic.group.as_ref().map(|g| !self.groups.iter().any(|x| &x.id == g)).unwrap_or(false) {
                    s.topic.group = None;
                }
                self.topics.push(s.topic);
                for mut c in s.cards {
                    c.rev += 1;
                    self.cards.push(c);
                }
            }
            Op::Say { text } => {
                if chars(&text) > SAY_LIMIT {
                    self.notes.push(format!("clipped say {SAY_LIMIT}"));
                }
                self.say = clip(&text, SAY_LIMIT);
            }
        }
        Ok(())
    }

    fn put_item(&mut self, id: &str, item: &str, cells: Vec<String>, update: bool, by: Author) -> Result<(), Reject> {
        let mut note = None;
        let c = self.card_mut(id)?;
        if !c.kind.has_items() {
            return Err(no("no-items", format!("{} takes no items", c.kind_name())));
        }
        if !valid_id(item) {
            return Err(no("bad-id", format!("item id '{item}' is not valid (1 to {ID_LIMIT} letters, digits, _ or -)")));
        }
        if cells.is_empty() || cells.len() > MAX_CELLS {
            return Err(no("cell-count", format!("an item has 1 to {MAX_CELLS} cells")));
        }
        // The third cell of an input box is what the user typed. An agent writes the name and the hint only.
        if by == Author::Ai && c.kind == Kind::Input && cells.len() > 2 {
            return Err(no("user-only", "the third cell of an input box is the user's value; write 'box name | hint or kind' only"));
        }
        let states: &[&str] = match c.kind {
            Kind::Checklist => &["done", "todo"],
            Kind::Progress => &["done", "run", "todo", "fail"],
            _ => &[],
        };
        if !states.is_empty() && !states.contains(&cells[0].as_str()) {
            return Err(no("bad-value", format!("the first cell of a {} item is one of {} (got '{}')", c.kind.name(), states.join("|"), cells[0])));
        }
        if c.kind == Kind::Route && cells.get(1).and_then(|v| v.split_once(',')).and_then(|(a, b)| Some((a.trim().parse::<f64>().ok()?, b.trim().parse::<f64>().ok()?))).is_none() {
            return Err(no("bad-value", "a route item is 'name | lat,lon | distance and time to the next stop (optional)'; the second cell must be two numbers"));
        }
        if c.kind == Kind::Draw && !["line", "arrow", "rect", "circle", "text"].contains(&cells[0].as_str()) {
            return Err(no("bad-value", format!("the first cell of a draw item is one of line|arrow|rect|circle|text (got '{}')", cells[0])));
        }
        if c.kind == Kind::Chart && cells.get(1).and_then(|v| v.replace(',', "").parse::<f64>().ok()).is_none() {
            return Err(no("bad-value", "a chart item is 'name | number'"));
        }
        if cells.iter().any(|x| chars(x) > CELL_LIMIT) {
            note = Some(format!("clipped {id}.{item} {CELL_LIMIT}"));
        }
        let cells: Vec<String> = cells.iter().map(|x| clip(x, CELL_LIMIT)).collect();
        match c.items.iter_mut().find(|(i, _)| i == item) {
            Some(slot) => slot.1 = cells, // add on an existing id overwrites (no duplicates)
            None if update => return Err(no("no-such-item", format!("card '{id}' has no item '{item}'; add it with add"))),
            None => {
                let limit = if c.kind == Kind::Draw { MAX_DRAW_ITEMS } else { MAX_ITEMS };
                if c.items.len() >= limit {
                    return Err(no("limit", format!("card '{id}' already has {limit} items")));
                }
                c.items.push((item.to_string(), cells));
            }
        }
        c.rev += 1;
        self.notes.extend(note);
        Ok(())
    }
}

#[cfg(test)]
mod shelf_tests {
    use super::*;

    #[test]
    fn archive_and_restore_keep_cards() {
        let mut b = Board::default();
        let run = |b: &mut Board, line: &str| b.apply(crate::lang::parse(line).unwrap().unwrap(), Author::Ai);
        run(&mut b, "topic trip 제주 여행").unwrap();
        run(&mut b, "card k1 note trip 메모").unwrap();
        run(&mut b, "set k1 text 숙소는 애월").unwrap();
        run(&mut b, "archive trip").unwrap();
        assert!(b.topics.is_empty() && b.cards.is_empty() && b.shelf.len() == 1);
        // An id on the shelf cannot be reused (so nothing collides when it comes back).
        assert_eq!(run(&mut b, "topic trip 다른 여행").unwrap_err().code, "shelved");
        run(&mut b, "topic t2 다른 주제").unwrap();
        assert_eq!(run(&mut b, "card k1 note t2 겹침").unwrap_err().code, "shelved");
        run(&mut b, "restore trip").unwrap();
        assert_eq!(b.card("k1").unwrap().field("text"), "숙소는 애월");
        assert!(b.shelf.is_empty());
    }
}

#[cfg(test)]
mod part_tests {
    use super::*;

    #[test]
    fn every_kind_is_registered_once_and_listed_for_the_model() {
        let table = parts_table();
        for p in PARTS {
            assert_eq!(PARTS.iter().filter(|q| q.name == p.name).count(), 1, "{} is registered twice", p.name);
            assert_eq!(Kind::parse(p.name), Some(p.kind));
            assert!(table.contains(&format!("| {} |", p.name)));
        }
        // Fields the renderer sets itself are accepted but not listed.
        assert!(!table.contains("chosen"));
        assert_eq!(Kind::Decision.field_limit("chosen"), Some(120));
        assert_eq!(Kind::Note.field_limit("text"), Some(240));
        assert_eq!(Kind::Note.field_limit("nope"), None);
    }

    /// The guide for agents carries the same table. It is written by hand, so this keeps it from drifting.
    #[test]
    fn the_guide_lists_the_registered_card_types() {
        let guide = include_str!("../../GUIDE.md").replace('\r', "");
        let table = guide.split("<!-- parts:begin -->
").nth(1).and_then(|t| t.split("<!-- parts:end -->").next()).expect("GUIDE.md has the parts markers");
        assert_eq!(table, parts_table());
    }

    #[test]
    fn named_values_can_be_set_and_cleared() {
        let mut b = Board::default();
        let run = |b: &mut Board, line: &str| b.apply(crate::lang::parse(line).unwrap().unwrap(), Author::Ai);
        run(&mut b, "let budget 120만원").unwrap();
        assert_eq!(b.vars.get("budget").map(String::as_str), Some("120만원"));
        assert!(crate::lang::serialize(&b).contains("let budget 120만원"));
        run(&mut b, "let budget").unwrap();
        assert!(b.vars.is_empty());
    }

    #[test]
    fn records_take_named_fields_and_extension_kinds_fall_back_to_them() {
        let mut b = Board::default();
        let run = |b: &mut Board, line: &str| match crate::lang::parse(line) {
            Ok(Some(op)) => b.apply(op, Author::Ai).map_err(|e| e.code),
            Ok(None) => Ok(()),
            Err(e) => Err(e.code),
        };
        run(&mut b, "topic t T").unwrap();
        run(&mut b, "card r1 record t Invoice 1042").unwrap();
        run(&mut b, "set r1 customer Acme Ltd").unwrap();
        run(&mut b, "set r1 due 2026-12-01").unwrap();
        assert_eq!(run(&mut b, "set r1 not!valid x"), Err("unknown-field"));
        run(&mut b, "add r1 l1 Design | 12h | 1,200").unwrap();
        assert_eq!(b.card("r1").unwrap().field("customer"), "Acme Ltd");
        // An extension kind is accepted by name and checked as a record.
        run(&mut b, "card k1 x-kanban t Sprint 12").unwrap();
        run(&mut b, "set k1 lane Doing").unwrap();
        let k = b.card("k1").unwrap();
        assert_eq!((k.kind, k.kind_name()), (Kind::Record, "x-kanban"));
        assert!(crate::lang::serialize(&b).contains("card k1 x-kanban t 3x3 Sprint 12\nset k1 lane Doing\n"));
        // A name that is neither known nor an extension is still a mistake.
        assert_eq!(run(&mut b, "card k2 kanban t X"), Err("unknown-kind"));
        assert_eq!(run(&mut b, "card k2 x- t X"), Err("unknown-kind"));
        assert_eq!(run(&mut b, "card k2 x-a!b t X"), Err("unknown-kind"));
        // Twelve fields of the writer's own, then no more; changing one of them still works.
        run(&mut b, "card r2 record t Many").unwrap();
        for n in 0..MAX_RECORD_FIELDS {
            assert_eq!(run(&mut b, &format!("set r2 f{n} v")), Ok(()));
        }
        assert_eq!(run(&mut b, "set r2 one-more v"), Err("limit"));
        assert_eq!(run(&mut b, "set r2 f0 changed"), Ok(()));
        assert_eq!(run(&mut b, "set r2 title Renamed"), Ok(()));
        // A decision that takes several answers, and one that cannot be undone.
        run(&mut b, "card d1 decision t Pick").unwrap();
        assert_eq!(run(&mut b, "set d1 multi yes"), Ok(()));
        assert_eq!(run(&mut b, "set d1 multi many"), Err("bad-value"));
        assert_eq!(run(&mut b, "set d1 tone danger"), Ok(()));
        assert_eq!(run(&mut b, "set d1 tone scary"), Err("bad-value"));
        // A document card points at something outside the board.
        run(&mut b, "card f1 doc t Q3 report").unwrap();
        assert_eq!(run(&mut b, "set f1 src C:\\Users\\me\\q3.pdf"), Ok(()));
        assert_eq!(run(&mut b, "add f1 a x"), Err("no-items"));
    }

    #[test]
    fn rejects_carry_stable_codes() {
        let mut b = Board::default();
        let run = |b: &mut Board, line: &str, by: Author| match crate::lang::parse(line) {
            Ok(Some(op)) => b.apply(op, by).map_err(|e| e.code),
            Ok(None) => Ok(()),
            Err(e) => Err(e.code),
        };
        let cases = [
            ("foo bar", "unknown-verb"),
            ("topic", "missing-argument"),
            ("topic a!b X", "bad-id"),
            ("card k1 note nowhere T", "no-such-topic"),
            ("topic t T", ""),
            ("card k1 gauge t T", "unknown-kind"),
            ("card k1 note t T", ""),
            ("card k1 note t T", "exists"),
            ("set k1 state ok", "unknown-field"),
            ("set k9 text x", "no-such-card"),
            ("add k1 i1 x", "no-items"),
            ("card s1 status t S", ""),
            ("set s1 state maybe", "bad-value"),
            ("card c1 checklist t C", ""),
            ("add c1 i1 later | x", "bad-value"),
            ("add c1 i1 todo | a | b | c | d | e | f", "cell-count"),
            ("upd c1 i9 todo | x", "no-such-item"),
            ("del c1 i9", "no-such-item"),
            ("del zzz", "not-found"),
            ("del t", "not-empty"),
            ("size c1 big", "bad-syntax"),
            ("move c1 a b", "bad-syntax"),
            ("put t g", "no-such-group"),
            ("group t G", "id-in-use"),
            ("pin c1", "user-only"),
            ("restore t", "not-shelved"),
        ];
        for (line, want) in cases {
            assert_eq!(run(&mut b, line, Author::Ai).err().unwrap_or(""), want, "{line}");
        }
        assert_eq!(run(&mut b, "move c1 1 1", Author::User), Ok(()));
        assert_eq!(run(&mut b, "move c1 0 0", Author::Ai), Err("pinned"));
        for n in 0..MAX_GROUPS {
            assert_eq!(run(&mut b, &format!("group g{n} G"), Author::Ai), Ok(()));
        }
        assert_eq!(run(&mut b, "group g9 G", Author::Ai), Err("limit"));
    }
}
