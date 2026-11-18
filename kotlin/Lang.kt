// The line language: one line is one op, applied the moment the line ends. PATET (SPEC.md)
// in Kotlin, ported from the reference implementation rust/src/lang.rs.
package patet

object Lang {
    private fun split1(s0: String): Pair<String, String> {
        val s = s0.trimWsStart()
        val i = s.indexOfFirst { isWhiteSpace(it.code) }
        return if (i < 0) s to "" else s.substring(0, i) to s.substring(i).trimWsStart()
    }

    private fun need(s: String, usage: String): String = s.ifEmpty { throw Rejected("missing-argument", "expected: $usage") }

    private fun parseSize(s: String): Pair<Int, Int>? {
        val i = s.indexOfFirst { it == 'x' || it == 'X' }
        if (i < 0) return null
        val w = digits(s.substring(0, i), 255, true) ?: return null
        val h = digits(s.substring(i + 1), 255, true) ?: return null
        return w to h
    }

    /** A column or a row: ASCII digits without a sign, 0 to 9999. */
    private fun cell(s: String): Int? = digits(s, 9999, false)

    /** ASCII digits only, no sign. Over `max`: the largest value when `saturate` (a size), not a number otherwise (a grid cell). */
    private fun digits(s: String, max: Int, saturate: Boolean): Int? {
        if (s.isEmpty() || !s.all { it in '0'..'9' }) return null
        val n = s.trimStart('0').ifEmpty { "0" }
        val v = if (n.length > 9) Int.MAX_VALUE else n.toInt()
        return if (v <= max) v else if (saturate) max else null
    }

    /** Split a value into cells at `|`. Inside a cell, `\\|` is a `|` that does not split. */
    fun splitCells(rest: String): List<String> {
        val out = mutableListOf<String>()
        val cur = StringBuilder()
        var i = 0
        while (i < rest.length) {
            val c = rest[i]
            if (c == '\\' && i + 1 < rest.length && rest[i + 1] == '|') {
                cur.append('|')
                i += 2
                continue
            }
            if (c == '|') {
                out.add(cur.toString().trimWs())
                cur.setLength(0)
            } else {
                cur.append(c)
            }
            i++
        }
        out.add(cur.toString().trimWs())
        return out
    }

    /** Write cells back as one value: joined by ` | `, a `|` inside a cell written as `\\|`. */
    fun joinCells(cells: List<String>): String = cells.joinToString(" | ") { it.replace("|", "\\|") }

    private fun cells(rest: String): List<String> = splitCells(rest)

    /** 한 줄을 조작으로 해석한다. 빈 줄·주석·코드 울타리·tell 은 null. 잘못된 줄이면 Rejected 를 던진다. */
    fun parse(raw: String): Op? {
        val line = raw.trimWs()
        if (line.isEmpty() || line.startsWith("#") || line.startsWith("```")) return null
        val (cmd, rest) = split1(line)
        return when (cmd) {
            "topic" -> split1(rest).let { (id, name) -> Op.Topic(need(id, "topic <id> <name>"), name) }
            "group" -> split1(rest).let { (id, name) -> Op.Group(need(id, "group <id> <name>"), name) }
            "mv" -> split1(rest).let { (card, topic) -> Op.Mv(need(card, "mv <card> <topic>"), need(topic, "mv <card> <topic>")) }
            "put" -> split1(rest).let { (topic, group) -> Op.Put(need(topic, "put <topic> <group>"), need(group, "put <topic> <group>")) }
            "card" -> {
                val (id, r1) = split1(rest)
                val (kind, r2) = split1(r1)
                val (topic, r3) = split1(r2)
                need(topic, "card <id> <kind> <topic> [<w>x<h>] <title>")
                // 크기는 생략 가능
                val (maybe, after) = split1(r3)
                val size = parseSize(maybe)
                Op.Card(id, kind, topic, size, if (size != null) after else r3)
            }
            "set" -> {
                val (id, r1) = split1(rest)
                val (field, value) = split1(r1)
                Op.Set(id, need(field, "set <id> <field> <value>"), value)
            }
            "add", "upd" -> {
                val (id, r1) = split1(rest)
                val (item, r2) = split1(r1)
                val usage = "$cmd <id> <item> <cell> | <cell> ..."
                need(item, usage)
                val c = cells(need(r2, usage))
                if (cmd == "add") Op.Add(id, item, c) else Op.Upd(id, item, c)
            }
            "del" -> split1(rest).let { (id, item) -> Op.Del(need(id, "del <id> [<item>]"), item.ifEmpty { null }) }
            "size" -> {
                val (id, s) = split1(rest)
                val (w, h) = parseSize(s) ?: throw Rejected("bad-syntax", "expected: size <id> <w>x<h>")
                Op.Size(id, w, h)
            }
            "move" -> {
                val (id, r1) = split1(rest)
                val (c, r) = split1(r1)
                val col = cell(c)
                val row = cell(r)
                if (col == null || row == null) throw Rejected("bad-syntax", "expected: move <id> <col> <row>")
                Op.Move(id, col, row)
            }
            "let" -> split1(rest).let { (name, value) -> Op.Let(need(name, "let <name> <value>"), value) }
            "archive" -> Op.Archive(need(rest, "archive <topic>"))
            "restore" -> Op.Restore(need(rest, "restore <topic>"))
            "pin", "unpin" -> Op.Pin(need(rest, "pin <id>"), cmd == "pin")
            "focus" -> Op.Focus(need(rest, "focus <id>"))
            "say" -> Op.Say(rest)
            // 소리 내어 읽는 문장. 보드를 바꾸지 않으므로 조작이 아니다 (음성 재생 쪽에서 따로 처리한다).
            "tell" -> null
            else -> throw Rejected("unknown-verb", "unknown verb '$cmd'")
        }
    }

    /** 보드 전체를 수정 언어로 적는다 (모델 입력용). 이 줄들을 빈 보드에 적용하면 같은 보드가 된다. */
    fun serialize(b: Board): String {
        val s = StringBuilder()
        for ((name, value) in b.vars) s.append("let $name $value\n")
        for (g in b.groups) s.append("group ${g.id} ${g.name}\n")
        for (t in b.topics) {
            s.append("topic ${t.id} ${t.name}\n")
            t.group?.let { s.append("put ${t.id} $it\n") }
        }
        for (c in b.cards) {
            s.append("card ${c.id} ${c.kindName} ${c.topic} ${c.w}x${c.h} ${c.title}\n")
            for ((f, v) in c.fields) s.append("set ${c.id} $f $v\n")
            for (i in c.items) s.append("add ${c.id} ${i.id} ${joinCells(i.cells)}\n")
            c.grid?.let { s.append("move ${c.id} ${it.first} ${it.second}\n") }
            if (c.pinned) s.append("pin ${c.id}\n")
        }
        return s.toString()
    }

    /**
     * 보관함까지 담아 파일에 적는다. 보관된 주제는 "만들었다가 archive" 하는 줄로 적는다:
     * 다시 읽을 때 사용자 권한으로 순서대로 적용하면 같은 보드와 보관함이 된다.
     */
    fun save(b: Board): String {
        val s = StringBuilder(serialize(b))
        for (sh in b.shelf) {
            val tmp = Board()
            tmp.topics.add(sh.topic)
            tmp.cards.addAll(sh.cards)
            // 분류는 위에서 이미 만들어졌다. 없어진 분류에 넣는 줄은 읽을 때 거부되고 넘어간다.
            s.append(serialize(tmp))
            s.append("archive ${sh.topic.id}\n")
        }
        return s.toString()
    }

    fun load(text: String): Board {
        val b = Board()
        for (line in text.lineSequence()) {
            try {
                parse(line)?.let { b.apply(it, Author.Restore) }
            } catch (_: Rejected) {
            }
        }
        b.notes.clear()
        return b
    }

    /** 진행 중인 줄이 긴 글을 쓰는 중이면 (카드 ID, 필드, 지금까지의 값). `say` 는 카드 ID 가 빈 문자열. */
    fun partialText(partial: String): Triple<String, String, String>? {
        val (cmd, rest) = split1(partial)
        return when (cmd) {
            "say" -> Triple("", "say", rest)
            "set" -> {
                val (id, r1) = split1(rest)
                val (field, value) = split1(r1)
                if (field == "text" && value.isNotEmpty()) Triple(id, field, value) else null
            }
            else -> null
        }
    }
}

sealed class Chunk {
    /** 완성된 한 줄 */
    data class Line(val text: String) : Chunk()

    /** 아직 끝나지 않은 현재 줄 (지금까지 받은 부분) */
    data class Partial(val text: String) : Chunk()
}

/** 토큰 스트림을 줄 단위로 끊는다. */
class LineStream {
    private val buf = StringBuilder()
    private var started = false

    fun feed(delta: String): List<Chunk> {
        buf.append(delta)
        // One U+FEFF at the very start of a stream or file is a byte order mark, not text.
        if (!started && buf.isNotEmpty()) {
            started = true
            if (buf[0] == '\uFEFF') buf.deleteCharAt(0)
        }
        val out = mutableListOf<Chunk>()
        while (true) {
            val i = buf.indexOf("\n")
            if (i < 0) break
            out.add(Chunk.Line(buf.substring(0, i).trimWsEnd()))
            buf.delete(0, i + 1)
        }
        if (buf.isNotEmpty()) out.add(Chunk.Partial(buf.toString()))
        return out
    }

    fun finish(): String? {
        val rest = buf.toString()
        buf.setLength(0)
        return if (rest.isWsBlank()) null else rest
    }
}
