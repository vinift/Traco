package io.github.vinift.traco.nativo.page

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * v1.46 — Desenho nativo da nota, etapa 1 (ver js/natpage.js e a seção 3d do CLAUDE.md).
 * Fica ATRÁS do WebView (transparente com a nota aberta). A página desenha os blocos e manda:
 *  - pixels(buf): [id, w, h, 0] int32 little-endian + RGBA (não pré-multiplicado, como o getImageData) — bloco ou miniatura;
 *  - place(id, L, x, y): bloco id fica no nível L na posição (x, y) em px CSS dentro do nível;
 *  - prev(pid, id): miniatura da página pid;  frames(json): [[pid, x, y, w, h, cor], …] em unidades da página (mundo);
 *  - scene(json): {sl, st, sw, sh (retângulo do #stage, px CSS), d (dpr), desk, tx, ty (translação da folha, px CSS), z, lv: [[L, escala, ordem]]}.
 * Desenho = o mesmo que o DOM fazia: fundo → molduras (papel + sombra + miniatura, escala z) → níveis por ordem (escala s/L).
 * Tudo protegido por `lock` (a ponte chama numa thread, os pixels chegam noutra, o desenho é na thread da tela).
 */
class PageView(ctx: Context) : View(ctx) {
    private class Place(val L: Double, val x: Float, val y: Float)
    private class Frame(val pid: String, val x: Float, val y: Float, val w: Float, val h: Float, val color: Int)
    private class Scene(val sl: Float, val st: Float, val sw: Float, val sh: Float, val d: Float, val desk: Int, val tx: Float, val ty: Float, val z: Float, val lv: List<Triple<Double, Float, Int>>)

    private val lock = Any()
    private val bmps = HashMap<Int, Bitmap>()
    private val places = HashMap<Int, Place>()
    private val prevOf = HashMap<String, Int>()
    private val prevLast = HashMap<String, Int>() // miniatura anterior: fica na tela até a nova chegar
    private val freed = LinkedHashSet<Int>()
    private var frames: List<Frame> = emptyList()
    private var scene: Scene? = null
    private val pBmp = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val pPaper = Paint(Paint.ANTI_ALIAS_FLAG)
    private val pShadow = Paint(Paint.ANTI_ALIAS_FLAG)
    private val r = RectF()

    init { setWillNotDraw(false) }

    private fun color(s: String?, def: Int): Int = try { if (s.isNullOrBlank()) def else Color.parseColor(s.trim()) } catch (_: Exception) { def }

    /* chega numa thread própria (Handler do canal), nunca na da tela */
    fun pixels(b: ByteArray) { try { pixels0(b) } catch (_: Throwable) {} } // erro aqui não pode derrubar o app
    private fun pixels0(b: ByteArray) {
        if (b.size < 16) return
        val bb = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN)
        val id = bb.getInt(0); val w = bb.getInt(4); val h = bb.getInt(8); val kind = bb.getInt(12)
        if (kind == 1 || kind == 2) { control(kind, bb, b.size); return } // apagar (na ordem dos pixels)
        if (w <= 0 || h <= 0 || b.size < 16 + w * h * 4) return
        synchronized(lock) { if (freed.contains(id)) { freed.remove(id); return } }
        var i = 16; val end = 16 + w * h * 4
        while (i < end) { // pré-multiplica (o Canvas do Android só desenha bitmaps pré-multiplicados); quase tudo é opaco
            val a = b[i + 3].toInt() and 255
            if (a != 255) {
                if (a == 0) { b[i] = 0; b[i + 1] = 0; b[i + 2] = 0 }
                else { b[i] = ((b[i].toInt() and 255) * a / 255).toByte(); b[i + 1] = ((b[i + 1].toInt() and 255) * a / 255).toByte(); b[i + 2] = ((b[i + 2].toInt() and 255) * a / 255).toByte() }
            }
            i += 4
        }
        val bmp = try { Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888) } catch (_: Throwable) { return }
        bmp.copyPixelsFromBuffer(ByteBuffer.wrap(b, 16, w * h * 4))
        val old: Bitmap?
        synchronized(lock) {
            if (freed.contains(id)) { freed.remove(id); bmp.recycle(); return }
            old = bmps.put(id, bmp)
        }
        old?.recycle()
        postInvalidateOnAnimation()
    }

    /* 1 = apagar os ids da lista; 2 = apagar todos os bitmaps com id menor que o informado (depois de um "limpar") */
    private fun control(kind: Int, bb: ByteBuffer, size: Int) {
        val olds = ArrayList<Bitmap>()
        synchronized(lock) {
            if (kind == 1) { var o = 16; while (o + 4 <= size) { val id = bb.getInt(o); o += 4; places.remove(id); bmps.remove(id)?.let { olds.add(it) } } }
            else { val lim = bb.getInt(16); val it = bmps.entries.iterator(); while (it.hasNext()) { val e = it.next(); if (e.key < lim) { olds.add(e.value); it.remove() } } }
        }
        for (x in olds) x.recycle()
        postInvalidateOnAnimation()
    }

    fun place(id: Int, L: Double, x: Float, y: Float) { synchronized(lock) { places[id] = Place(L, x, y) }; postInvalidateOnAnimation() }
    fun prev(pid: String, id: Int) { synchronized(lock) { prevOf[pid]?.let { if (it != id && bmps.containsKey(it)) prevLast[pid] = it }; prevOf[pid] = id }; postInvalidateOnAnimation() }

    fun free(id: Int) {
        val old: Bitmap?
        synchronized(lock) {
            places.remove(id); old = bmps.remove(id)
            if (old == null) { freed.add(id); while (freed.size > 4000) freed.remove(freed.first()) } // os pixels ainda não chegaram: descarta quando chegarem
        }
        old?.recycle()
        postInvalidateOnAnimation()
    }

    fun frames(json: String) {
        val list = ArrayList<Frame>()
        try { val a = JSONArray(json); for (k in 0 until a.length()) { val f = a.getJSONArray(k); list.add(Frame(f.getString(0), f.getDouble(1).toFloat(), f.getDouble(2).toFloat(), f.getDouble(3).toFloat(), f.getDouble(4).toFloat(), color(f.optString(5), Color.WHITE))) } } catch (_: Exception) {}
        synchronized(lock) { frames = list; val keep = list.map { it.pid }.toSet(); prevOf.keys.retainAll(keep); prevLast.keys.retainAll(keep) }
        postInvalidateOnAnimation()
    }

    fun scene(json: String) {
        val sc = try {
            val o = JSONObject(json); val lv = ArrayList<Triple<Double, Float, Int>>(); val a = o.optJSONArray("lv")
            if (a != null) for (k in 0 until a.length()) { val l = a.getJSONArray(k); lv.add(Triple(l.getDouble(0), l.getDouble(1).toFloat(), l.getInt(2))) }
            lv.sortBy { it.third }
            Scene(o.optDouble("sl").toFloat(), o.optDouble("st").toFloat(), o.optDouble("sw").toFloat(), o.optDouble("sh").toFloat(), o.optDouble("d", 1.0).toFloat(), color(o.optString("desk"), Color.LTGRAY), o.optDouble("tx").toFloat(), o.optDouble("ty").toFloat(), o.optDouble("z", 1.0).toFloat(), lv)
        } catch (_: Exception) { null }
        synchronized(lock) { scene = sc }
        postInvalidateOnAnimation()
    }

    fun clear() {
        synchronized(lock) { places.clear(); prevOf.clear(); prevLast.clear(); frames = emptyList(); scene = null } // os bitmaps saem pelo canal (tipo 2), na ordem dos pixels
        postInvalidateOnAnimation()
    }

    fun reset() {
        val olds: List<Bitmap>
        synchronized(lock) { olds = bmps.values.toList(); bmps.clear(); freed.clear(); places.clear(); prevOf.clear(); prevLast.clear(); frames = emptyList(); scene = null }
        for (b in olds) b.recycle()
        postInvalidateOnAnimation()
    }

    fun stat(): String = synchronized(lock) {
        var bytes = 0L; for (b in bmps.values) bytes += b.allocationByteCount.toLong()
        JSONObject().put("bitmaps", bmps.size).put("blocos", places.size).put("miniaturas", prevOf.size).put("mb", bytes / 1048576L).put("cena", scene != null).toString()
    }

    override fun onDraw(c: Canvas) { try { draw0(c) } catch (_: Throwable) {} }
    private fun draw0(c: Canvas) {
        synchronized(lock) {
            val s = scene ?: return
            val d = s.d
            c.save()
            c.clipRect(s.sl * d, s.st * d, (s.sl + s.sw) * d, (s.st + s.sh) * d)
            c.drawColor(s.desk)
            c.translate((s.sl + s.tx) * d, (s.st + s.ty) * d)
            val k = s.z * d
            for (f in frames) { // papel + sombra (como o box-shadow do .pgf, que também escala com o zoom) + miniatura
                r.set(f.x * k, f.y * k, (f.x + f.w) * k, (f.y + f.h) * k)
                if (c.quickReject(r.left - 12f * k, r.top - 12f * k, r.right + 12f * k, r.bottom + 12f * k)) continue // fora da tela
                pShadow.color = Color.WHITE; pShadow.setShadowLayer(8f * k / 2f, 0f, 1f * k, 0x29000000)
                c.drawRect(r, pShadow)
                pPaper.color = f.color; c.drawRect(r, pPaper)
                val pb = prevOf[f.pid]?.let { bmps[it] } ?: prevLast[f.pid]?.let { bmps[it] }
                if (pb != null && !pb.isRecycled) c.drawBitmap(pb, null, r, pBmp)
            }
            for ((L, sc, _) in s.lv) {
                c.save(); if (sc != 1f) c.scale(sc, sc)
                for ((id, p) in places) {
                    if (p.L != L) continue
                    val b = bmps[id] ?: continue
                    if (b.isRecycled) continue
                    c.drawBitmap(b, p.x * d, p.y * d, pBmp)
                }
                c.restore()
            }
            c.restore()
        }
    }
}
