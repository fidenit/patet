// The board and its ops: PATET (SPEC.md) in Kotlin, ported from the reference
// implementation rust/src/core.rs. The card types (PARTS), the checks, the codes and the messages
// must stay the same as there; the tests run the protocol's conformance cases against this file.
package patet

import java.util.TreeMap

enum class Kind {
    Note, Status, Progress, Decision, Input, Checklist, Table, Metric, Chart, Timeline, Route, Draw, Image, Web, Record, Doc;

    val part: Part get() = PARTS.first { it.kind == this }
    val label: String get() = part.name

    /** 사용자의 답을 기다리는 카드인가 ("내 차례"로 가져갈 것) */
    val asks: Boolean get() = this == Decision || this == Input
    val hasItems: Boolean get() = part.items.isNotEmpty()

    /** 필드별 글자 수 한도. 이 종류에 없는 필드면 null. */
    fun fieldLimit(field: String): Int? {
        if (field == "title") return 40
        part.fields.firstOrNull { it.name == field }?.let { return it.limit }
        // A record takes any field name that is a valid id.
        return if (this == Record && validId(field)) RECORD_FIELD_LIMIT else null
    }

    companion object {
        fun parse(s: String): Kind? = PARTS.firstOrNull { it.name == s }?.kind
    }
}

/** 필드: 이름, 글자 한도, 모델에게 보일 설명 (비어 있으면 프로그램이 안에서만 쓰는 필드). */
class Field(val name: String, val limit: Int, val doc: String)

class Part(val kind: Kind, val name: String, val w: Int, val h: Int, val purpose: String, val fields: List<Field>, val items: String)

/** 등록된 부품들. 여기 적힌 순서대로 모델에게 소개된다. */
val PARTS: List<Part> = listOf(
    Part(Kind.Status, "status", 2, 1, "one state", listOf(Field("state", 8, "state: ok/run/wait/fail/idle"), Field("text", 80, "text(80)")), ""),
    Part(Kind.Metric, "metric", 2, 2, "one number", listOf(Field("value", 14, "value(14)"), Field("unit", 8, "unit(8)"), Field("delta", 14, "delta(14, colored when it starts with + or -)"), Field("text", 60, "text(60)")), ""),
    Part(Kind.Chart, "chart", 4, 3, "quantities as a picture: comparison (bar), change over time (line), shares (donut)", listOf(Field("unit", 8, "unit(8)"), Field("form", 8, "form: bar(default)/line/donut")), "name | number"),
    Part(Kind.Route, "route", 6, 5, "a route: where the stops are, the shape of the way, distance and time per leg", listOf(Field("total", 40, "total(whole distance and time, 40)"), Field("text", 80, "text(80)")), "name | lat,lon | distance and time to the next stop"),
    Part(Kind.Draw, "draw", 5, 4, "a drawing no other type can show: structure, flow, seating, relations", listOf(Field("text", 80, "text(80)")), "shape | coordinates | text | color | size"),
    Part(Kind.Image, "image", 4, 3, "a picture file or picture address shown as it is: a photo, a capture, a generated image", listOf(Field("src", 600, "src: absolute path of a picture file, or the web address of a picture"), Field("text", 80, "text(caption, 80)")), ""),
    Part(Kind.Table, "table", 4, 3, "a comparison or a list with several attributes", listOf(Field("cols", 200, "cols: column | column ...")), "cell | cell ... (up to 6 cells)"),
    Part(Kind.Progress, "progress", 3, 3, "work in progress", listOf(Field("pct", 3, "pct(0-100)"), Field("text", 60, "text(60)")), "done/run/todo/fail | step name"),
    Part(Kind.Checklist, "checklist", 3, 3, "things to do (the user can tick them)", listOf(), "done/todo | text"),
    Part(Kind.Decision, "decision", 3, 3, "something the user has to decide (pick one)", listOf(Field("text", 120, "text(the question, 120)"), Field("multi", 8, "multi: yes when several may be picked"), Field("tone", 8, "tone: danger when the choice cannot be undone"), Field("chosen", 120, "")), "option name | one-line description"),
    Part(Kind.Input, "input", 3, 3, "values the user has to give (fill in): a date, a name, a number, an address", listOf(Field("text", 120, "text(what is asked and why, 120)"), Field("sent", 8, "")), "box name (end it with * when it must be filled) | hint (an example) or the kind of box: date / time / number / slider 0~100 unit / choice A / B / C"),
    Part(Kind.Timeline, "timeline", 3, 3, "things in order of time", listOf(), "when | text | done/run/todo (optional)"),
    Part(Kind.Note, "note", 3, 2, "a short text that fits none of the above", listOf(Field("text", 240, "text(240)")), ""),
    Part(Kind.Web, "web", 6, 5, "a web page or an HTML file shown as it is, in a small browser", listOf(Field("url", 600, "url: a web address, or the absolute path of a file on this computer")), ""),
    Part(Kind.Record, "record", 3, 3, "one thing with named properties that no other type fits: an invoice, a contact, a ticket, a setting", listOf(Field("text", 240, "any field name of your choosing, shown as label and value (80 each, up to 12), text(240)"), Field("cols", 200, "cols: column | column ... (when it has rows)")), "cell | cell ... (up to 6 cells, optional)"),
    Part(Kind.Doc, "doc", 3, 2, "a document, file or link that is too long for the board: shown by name with a summary, opened by the user", listOf(Field("src", 600, "src: absolute path of the file, or a web address"), Field("text", 240, "text(what it is and what it says, 240)")), ""),
)

/** Is this the name of an extension kind (`x-` and then an id)? Every renderer accepts one and treats it as a record. */
fun isExtensionKind(name: String): Boolean = name.startsWith("x-") && validId(name.substring(2)) && chars(name) <= 24

/** 모델에게 줄 부품 표 (마크다운). 등록된 내용에서 만든다. */
fun partsTable(): String {
    val t = StringBuilder("| Type | Use | Fields (length limit) | Item | Default size |\n|---|---|---|---|---|\n")
    fun cell(s: String) = if (s.isEmpty()) "none" else s.replace("|", "\\|")
    for (p in PARTS) {
        val fields = p.fields.map { it.doc }.filter { it.isNotEmpty() }
        t.append("| ${p.name} | ${p.purpose} | ${cell(fields.joinToString(", "))} | ${cell(p.items)} | ${p.w}x${p.h} |\n")
    }
    return t.toString()
}

const val MAX_ITEMS = 24
const val MAX_CELLS = 6
const val CELL_LIMIT = 60
const val MAX_W = 8
const val MAX_H = 8
const val RECORD_FIELD_LIMIT = 80
const val MAX_RECORD_FIELDS = 12

/** Restore loads a board written back as ops: it has the user's rights, but its `move` and `size` do not pin. */
enum class Author { Ai, User, Restore }

sealed class Op {
    data class Topic(val id: String, val name: String) : Op()
    data class Group(val id: String, val name: String) : Op()
    data class Mv(val card: String, val topic: String) : Op()
    data class Put(val topic: String, val group: String) : Op()
    data class Card(val id: String, val kind: String, val topic: String, val size: Pair<Int, Int>?, val title: String) : Op()
    data class Set(val id: String, val field: String, val value: String) : Op()
    data class Add(val id: String, val item: String, val cells: List<String>) : Op()
    data class Upd(val id: String, val item: String, val cells: List<String>) : Op()
    data class Del(val id: String, val item: String?) : Op()
    data class Size(val id: String, val w: Int, val h: Int) : Op()
    data class Move(val id: String, val col: Int, val row: Int) : Op()
    data class Pin(val id: String, val on: Boolean) : Op()
    data class Focus(val id: String) : Op()
    data class Say(val text: String) : Op()
    data class Let(val name: String, val value: String) : Op()
    data class Archive(val topic: String) : Op()
    data class Restore(val topic: String) : Op()
}

class Group(val id: String, var name: String)
class Topic(val id: String, var name: String, var group: String? = null)
class Item(val id: String, var cells: List<String>)

class Card(
    val id: String,
    val kind: Kind,
    var topic: String,
    var title: String,
    var w: Int,
    var h: Int,
    /** The name of the extension kind (`x-...`) when the card was created as one. Its kind is then Record. */
    val ext: String? = null,
) {
    /** The kind as the writer named it. */
    val kindName: String get() = ext ?: kind.label

    val fields: TreeMap<String, String> = TreeMap(BY_CODE_POINT)
    val items: MutableList<Item> = mutableListOf()
    var grid: Pair<Int, Int>? = null
    var pinned: Boolean = false
    var rev: Long = 1

    /** 아직 줄이 끝나지 않은 채 흘러 들어오는 중인 값 (필드, 부분 문자열). */
    var live: Pair<String, String>? = null

    fun field(name: String): String {
        live?.let { if (it.first == name) return it.second }
        return fields[name] ?: ""
    }
}

class Shelved(val topic: Topic, val cards: List<Card>)

/** Why an op was not applied: a stable code for programs, an English message for whoever wrote the line. */
class Rejected(val code: String, message: String) : Exception(message) {
    /** The verdict as the protocol writes it: `<code> <message>`. */
    val line: String get() = "$code $message"
}

fun chars(s: String): Int = s.codePointCount(0, s.length)

fun clip(s: String, limit: Int): String {
    if (chars(s) <= limit) return s
    val keep = (limit - 1).coerceAtLeast(0)
    return s.substring(0, s.offsetByCodePoints(0, keep)) + "…"
}

/** White space is the Unicode property White_Space, the same 25 characters in every implementation. */
fun isWhiteSpace(c: Int): Boolean =
    c in 0x09..0x0D || c == 0x20 || c == 0x85 || c == 0xA0 || c == 0x1680 || c in 0x2000..0x200A || c == 0x2028 || c == 0x2029 || c == 0x202F || c == 0x205F || c == 0x3000

fun String.trimWs(): String = trim { isWhiteSpace(it.code) }
fun String.trimWsStart(): String = trimStart { isWhiteSpace(it.code) }
fun String.trimWsEnd(): String = trimEnd { isWhiteSpace(it.code) }
fun String.isWsBlank(): Boolean = all { isWhiteSpace(it.code) }

/** An id: ASCII letters and digits, `_`, `-`, and any character outside ASCII that is neither white space nor a control character. */
internal fun validId(id: String): Boolean =
    id.isNotEmpty() && chars(id) <= 24 && id.codePoints().allMatch { c ->
        if (c < 0x80) (c in 'a'.code..'z'.code || c in 'A'.code..'Z'.code || c in '0'.code..'9'.code || c == '_'.code || c == '-'.code)
        else !isWhiteSpace(c) && c !in 0x80..0x9F
    }

private val NUMBER = Regex("[+-]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)([eE][+-]?[0-9]+)?")

/** A number as the protocol writes it: decimal, with an optional sign, fraction and exponent, and finite. */
internal fun isNumber(s: String): Boolean = NUMBER.matches(s) && (s.toDoubleOrNull()?.isFinite() ?: false)

/** Names are written in code point order (a Kotlin string compares UTF-16 units, which differs above U+FFFF). */
internal val BY_CODE_POINT = Comparator<String> { a, b ->
    val x = a.codePoints().iterator(); val y = b.codePoints().iterator()
    while (x.hasNext() && y.hasNext()) { val d = x.nextInt().compareTo(y.nextInt()); if (d != 0) return@Comparator d }
    x.hasNext().compareTo(y.hasNext())
}

class Board {
    val groups: MutableList<Group> = mutableListOf()
    val topics: MutableList<Topic> = mutableListOf()
    val cards: MutableList<Card> = mutableListOf()
    val shelf: MutableList<Shelved> = mutableListOf()
    val vars: TreeMap<String, String> = TreeMap(BY_CODE_POINT)
    var say: String = ""
    var focus: String? = null

    /** 한도 초과로 잘린 것 등, 다음 턴에 모델에게 알려줄 내용. */
    val notes: MutableList<String> = mutableListOf()

    fun card(id: String): Card? = cards.firstOrNull { it.id == id }
    private fun cardMut(id: String): Card = card(id) ?: throw Rejected("no-such-card", "no card '$id'")

    /** 글 안의 {이름} 을 이름 붙은 값으로 바꿔 보여 준다. */
    fun show(s: String): String {
        if (vars.isEmpty() || !s.contains('{')) return s
        return Regex("\\{([^{}\\s]+)\\}").replace(s) { m -> vars[m.groupValues[1]] ?: m.value }
    }

    /** 조작 하나를 검사하고 반영한다. 거부되면 Rejected 를 던진다. */
    fun apply(op: Op, by: Author) {
        when (op) {
            is Op.Topic -> {
                if (!validId(op.id)) throw Rejected("bad-id", "topic id '${op.id}' is not valid (1 to 24 letters, digits, _ or -)")
                if (shelf.any { it.topic.id == op.id }) throw Rejected("shelved", "topic '${op.id}' is on the shelf; bring it back with: restore ${op.id}")
                val name = clip(op.name.ifEmpty { op.id }, 24)
                val t = topics.firstOrNull { it.id == op.id }
                if (t != null) t.name = name else topics.add(Topic(op.id, name))
            }
            is Op.Group -> {
                if (!validId(op.id)) throw Rejected("bad-id", "group id '${op.id}' is not valid (1 to 24 letters, digits, _ or -)")
                // Ids on the shelf stay reserved, for a group too: the topic or card comes back with its id.
                if (shelf.any { s -> s.topic.id == op.id || s.cards.any { it.id == op.id } }) throw Rejected("shelved", "'${op.id}' is the id of a topic or a card on the shelf; use another id")
                if (topics.any { it.id == op.id } || card(op.id) != null) throw Rejected("id-in-use", "'${op.id}' is already the id of a topic or a card")
                val name = clip(op.name.ifEmpty { op.id }, 16)
                val g = groups.firstOrNull { it.id == op.id }
                if (g != null) {
                    g.name = name
                } else {
                    if (groups.size >= 8) throw Rejected("limit", "at most 8 groups; make the groups broader")
                    groups.add(Group(op.id, name))
                }
            }
            is Op.Mv -> {
                if (topics.none { it.id == op.topic }) throw Rejected("no-such-topic", "no topic '${op.topic}'")
                val c = cardMut(op.card)
                c.topic = op.topic
                c.grid = null
                c.pinned = false
                c.rev++
            }
            is Op.Put -> {
                if (groups.none { it.id == op.group }) throw Rejected("no-such-group", "no group '${op.group}'; create it first with: group ${op.group} <name>")
                val t = topics.firstOrNull { it.id == op.topic } ?: throw Rejected("no-such-topic", "no topic '${op.topic}'")
                t.group = op.group
            }
            is Op.Card -> {
                if (shelf.any { s -> s.cards.any { it.id == op.id } }) throw Rejected("shelved", "card id '${op.id}' belongs to a card on the shelf; use another id")
                if (!validId(op.id)) throw Rejected("bad-id", "card id '${op.id}' is not valid (1 to 24 letters, digits, _ or -)")
                if (card(op.id) != null) throw Rejected("exists", "card '${op.id}' already exists; change it with set/add/upd instead of creating it again")
                val known = Kind.parse(op.kind)
                if (known == null && !isExtensionKind(op.kind)) throw Rejected("unknown-kind", "no card type '${op.kind}'")
                val k = known ?: Kind.Record
                if (topics.none { it.id == op.topic }) throw Rejected("no-such-topic", "no topic '${op.topic}'; create it first with: topic ${op.topic} <name>")
                val (w, h) = op.size ?: (k.part.w to k.part.h)
                if (chars(op.title) > 40) notes.add("clipped ${op.id}.title 40")
                cards.add(Card(op.id, k, op.topic, clip(op.title, 40), w.coerceIn(1, MAX_W), h.coerceIn(1, MAX_H), if (known == null) op.kind else null))
            }
            is Op.Set -> {
                val c = cardMut(op.id)
                val limit = c.kind.fieldLimit(op.field) ?: throw Rejected("unknown-field", "${c.kindName} has no field '${op.field}'")
                if (c.kind == Kind.Record && op.field != "title" && !c.fields.containsKey(op.field) && c.fields.size >= MAX_RECORD_FIELDS) {
                    throw Rejected("limit", "card '${op.id}' already has $MAX_RECORD_FIELDS fields")
                }
                // The user's answers are the user's: an agent does not write them.
                if (by == Author.Ai && ((c.kind == Kind.Decision && op.field == "chosen") || (c.kind == Kind.Input && op.field == "sent"))) {
                    throw Rejected("user-only", "'${op.field}' is the user's answer; it is set when the user picks or sends, never by an agent")
                }
                if (c.kind == Kind.Input && op.field == "sent" && op.value != "yes") throw Rejected("bad-value", "input.sent is yes (got '${op.value}')")
                if (c.kind == Kind.Decision && op.field == "multi" && op.value !in listOf("yes", "no")) {
                    throw Rejected("bad-value", "decision.multi is yes or no (got '${op.value}')")
                }
                if (c.kind == Kind.Decision && op.field == "tone" && op.value !in listOf("normal", "danger")) {
                    throw Rejected("bad-value", "decision.tone is normal or danger (got '${op.value}')")
                }
                if (c.kind == Kind.Status && op.field == "state" && op.value !in listOf("ok", "run", "wait", "fail", "idle")) {
                    throw Rejected("bad-value", "status.state is one of ok|run|wait|fail|idle (got '${op.value}')")
                }
                if (c.kind == Kind.Progress && op.field == "pct" && (op.value.toIntOrNull()?.let { it !in 0..100 } ?: true)) {
                    throw Rejected("bad-value", "progress.pct is a whole number from 0 to 100 (got '${op.value}')")
                }
                if (chars(op.value) > limit) notes.add("clipped ${op.id}.${op.field} $limit")
                val v = clip(op.value, limit)
                if (op.field == "title") c.title = v else c.fields[op.field] = v
                c.live = null
                c.rev++
            }
            is Op.Add -> putItem(op.id, op.item, op.cells, false, by)
            is Op.Upd -> putItem(op.id, op.item, op.cells, true, by)
            is Op.Del -> {
                if (op.item != null) {
                    val c = cardMut(op.id)
                    if (!c.items.removeAll { it.id == op.item }) throw Rejected("no-such-item", "card '${op.id}' has no item '${op.item}'")
                    c.rev++
                } else {
                    if (!cards.removeAll { it.id == op.id }) {
                        // 카드가 아니면 주제 삭제로 본다 (비어 있을 때만).
                        if (topics.any { it.id == op.id }) {
                            if (cards.any { it.topic == op.id }) throw Rejected("not-empty", "topic '${op.id}' still has cards")
                            topics.removeAll { it.id == op.id }
                        } else if (groups.any { it.id == op.id }) {
                            groups.removeAll { it.id == op.id }
                            topics.filter { it.group == op.id }.forEach { it.group = null }
                        } else {
                            throw Rejected("not-found", "nothing has the id '${op.id}'")
                        }
                    }
                    if (focus == op.id) focus = null
                }
            }
            is Op.Size -> {
                val c = cardMut(op.id)
                if (by == Author.Ai && c.pinned) throw Rejected("pinned", "the user pinned '${op.id}'; its size cannot be changed")
                c.w = op.w.coerceIn(1, MAX_W)
                c.h = op.h.coerceIn(1, MAX_H)
                if (by == Author.User) c.pinned = true
                c.rev++
            }
            is Op.Move -> {
                val c = cardMut(op.id)
                if (by == Author.Ai && c.pinned) throw Rejected("pinned", "the user pinned '${op.id}'; it cannot be moved")
                c.grid = op.col.coerceAtLeast(0) to op.row.coerceAtLeast(0)
                if (by == Author.User) c.pinned = true
            }
            is Op.Pin -> {
                if (by == Author.Ai) throw Rejected("user-only", "only the user can pin or unpin")
                val c = cardMut(op.id)
                c.pinned = op.on
                if (!op.on) c.grid = null
            }
            is Op.Focus -> {
                cardMut(op.id)
                focus = op.id
            }
            is Op.Let -> {
                if (!validId(op.name)) throw Rejected("bad-id", "value name '${op.name}' is not valid (1 to 24 letters, digits, _ or -)")
                if (op.value.isWsBlank()) {
                    vars.remove(op.name)
                } else {
                    if (!vars.containsKey(op.name) && vars.size >= 64) throw Rejected("limit", "at most 64 named values")
                    if (chars(op.value) > CELL_LIMIT) notes.add("clipped let.${op.name} $CELL_LIMIT")
                    vars[op.name] = clip(op.value.trimWs(), CELL_LIMIT)
                }
            }
            is Op.Archive -> {
                val t = topics.firstOrNull { it.id == op.topic } ?: throw Rejected("no-such-topic", "no topic '${op.topic}'")
                topics.remove(t)
                val gone = cards.filter { it.topic == op.topic }
                cards.removeAll(gone)
                if (gone.any { it.id == focus }) focus = null
                shelf.add(Shelved(t, gone))
            }
            is Op.Restore -> {
                val s = shelf.firstOrNull { it.topic.id == op.topic } ?: throw Rejected("not-shelved", "no topic '${op.topic}' on the shelf")
                shelf.remove(s)
                // 보관해 둔 사이에 분류가 없어졌으면 미분류로 꺼낸다.
                if (s.topic.group != null && groups.none { it.id == s.topic.group }) s.topic.group = null
                topics.add(s.topic)
                for (c in s.cards) {
                    c.rev++
                    cards.add(c)
                }
            }
            is Op.Say -> {
                if (chars(op.text) > 80) notes.add("clipped say 80")
                say = clip(op.text, 80)
            }
        }
    }

    private fun putItem(id: String, item: String, cells: List<String>, update: Boolean, by: Author) {
        val c = cardMut(id)
        if (!c.kind.hasItems) throw Rejected("no-items", "${c.kindName} takes no items")
        if (!validId(item)) throw Rejected("bad-id", "item id '$item' is not valid (1 to 24 letters, digits, _ or -)")
        if (cells.isEmpty() || cells.size > MAX_CELLS) throw Rejected("cell-count", "an item has 1 to $MAX_CELLS cells")
        // The third cell of an input box is what the user typed. An agent writes the name and the hint only.
        if (by == Author.Ai && c.kind == Kind.Input && cells.size > 2) {
            throw Rejected("user-only", "the third cell of an input box is the user's value; write 'box name | hint or kind' only")
        }
        val states = when (c.kind) {
            Kind.Checklist -> listOf("done", "todo")
            Kind.Progress -> listOf("done", "run", "todo", "fail")
            else -> emptyList()
        }
        if (states.isNotEmpty() && cells[0] !in states) throw Rejected("bad-value", "the first cell of a ${c.kind.label} item is one of ${states.joinToString("|")} (got '${cells[0]}')")
        if (c.kind == Kind.Route) {
            val ok = cells.getOrNull(1)?.split(',', limit = 2)?.let { p -> p.size == 2 && isNumber(p[0].trimWs()) && isNumber(p[1].trimWs()) } ?: false
            if (!ok) throw Rejected("bad-value", "a route item is 'name | lat,lon | distance and time to the next stop (optional)'; the second cell must be two numbers")
        }
        if (c.kind == Kind.Draw && cells[0] !in listOf("line", "arrow", "rect", "circle", "text")) {
            throw Rejected("bad-value", "the first cell of a draw item is one of line|arrow|rect|circle|text (got '${cells[0]}')")
        }
        if (c.kind == Kind.Chart && cells.getOrNull(1)?.replace(",", "")?.let { isNumber(it) } != true) throw Rejected("bad-value", "a chart item is 'name | number'")
        val clipped = cells.map { clip(it, CELL_LIMIT) }
        val slot = c.items.firstOrNull { it.id == item }
        if (slot != null) {
            slot.cells = clipped // add 가 기존 ID 에 오면 덮어쓴다 (중복 생성 방지)
        } else {
            if (update) throw Rejected("no-such-item", "card '$id' has no item '$item'; add it with add")
            // 그림 카드는 도형 하나가 항목 하나라서 더 많이 받는다.
            val limit = if (c.kind == Kind.Draw) 80 else MAX_ITEMS
            if (c.items.size >= limit) throw Rejected("limit", "card '$id' already has $limit items")
            c.items.add(Item(item, clipped))
        }
        // Noted only once the op is accepted: a rejected op leaves nothing behind for the next verdict.
        if (cells.any { chars(it) > CELL_LIMIT }) notes.add("clipped $id.$item $CELL_LIMIT")
        c.rev++
    }
}
