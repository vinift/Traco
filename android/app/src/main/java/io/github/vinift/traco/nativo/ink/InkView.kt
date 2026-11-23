package io.github.vinift.traco.nativo.ink

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.PorterDuff
import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.SurfaceView
import androidx.graphics.lowlatency.CanvasFrontBufferedRenderer
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Tinta ao vivo de baixa latência ("front buffer"): uma camada transparente por cima do WebView.
 *
 * Como funciona com a web (js/native.js + Editor.startDraw/endDraw):
 * 1. A caneta encosta: o Android já guarda os pontos (onPen), mas ainda não desenha.
 * 2. A página decide que é um traço de caneta comum e chama TracoNative.inkGo(estilo) — daí em diante o traço é
 *    desenhado aqui, direto no buffer da tela (sem esperar o quadro do navegador). A web não desenha a prévia dela.
 * 3. A caneta levanta: o traço fica nesta camada (commit) até a página mostrar o traço gravado nos blocos;
 *    então a web chama inkClear(id) e ele some daqui — sem piscar.
 * Forma reconhecida, palma, rolagem ou zoom: a web chama inkClear antes.
 * A camada não recebe toques (dispatchTouchEvent = false): tudo segue para a página.
 */
class InkView(ctx: Context) : SurfaceView(ctx), CanvasFrontBufferedRenderer.Callback<InkView.Seg> {

    class Style(val color: Int, val w: Float, val natural: Boolean, val sens: Float, val stab: Int, val dpr: Float, val clip: RectF)
    class Stroke(val id: Int, val st: Style) {
        val f = StrokeFilter(st.stab, st.sens)
        val segs = CopyOnWriteArrayList<FloatArray>() // pedaços já desenhados: x, y, raio (px do aparelho)
        @Volatile var dead = false
        var sent = 0
    }
    class Seg(val s: Stroke, val p: FloatArray)

    @Volatile private var ok = false
    private var r: CanvasFrontBufferedRenderer<Seg>? = null
    private val main = Handler(Looper.getMainLooper())
    private val lock = Any()

    /* estado da caneta (linha da tela) */
    private var down = false
    private val buf = FloatList()
    private var cur: Stroke? = null
    private val done = CopyOnWriteArrayList<Stroke>()
    private var nextId = 1

    private val pF = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val pM = Paint(pF)
    private val dF = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val dM = Paint(dF)

    init {
        setZOrderOnTop(true)
        holder.setFormat(PixelFormat.TRANSPARENT)
        isClickable = false; isFocusable = false; isFocusableInTouchMode = false
    }

    fun supported() = ok

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        try { r = CanvasFrontBufferedRenderer(this, this); ok = true } catch (_: Throwable) { ok = false }
    }
    override fun onDetachedFromWindow() { ok = false; try { r?.release(true) } catch (_: Throwable) {}; r = null; super.onDetachedFromWindow() }
    override fun dispatchTouchEvent(event: MotionEvent?) = false
    override fun onTouchEvent(event: MotionEvent?) = false

    /* ---------- entrada (linha da tela, chamada pela MainActivity antes do WebView) ---------- */
    fun onPen(e: MotionEvent) {
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> { ending?.let { finalizeEnd(it, null) }; down = true; buf.clear(); cur = null; rawCount = 0; collect(e) }
            MotionEvent.ACTION_MOVE -> collect(e)
            /* v1.2.4: as amostras que chegam junto com o ACTION_UP NÃO entram — a página (WebView) não as recebe (o pointerup traz a
               posição do último movimento), e o traço gravado terminava até ~5 px antes da tinta nativa ("voltava" ao levantar; medido no relatório) */
            MotionEvent.ACTION_UP -> { end(); down = false }
            MotionEvent.ACTION_CANCEL -> { down = false; cur?.let { kill(it) }; cur = null }
        }
    }

    private fun collect(e: MotionEvent) {
        for (h in 0 until e.historySize) point(e.getHistoricalX(0, h), e.getHistoricalY(0, h), e.getHistoricalPressure(0, h))
        point(e.x, e.y, e.pressure)
        flush()
    }

    private fun point(x: Float, y: Float, p: Float) {
        rawCount++
        val c = cur
        if (c == null) { if (down) buf.add(x, y, p) }
        else if (!c.dead) c.f.add(x / c.st.dpr, y / c.st.dpr, p)
    }

    /* manda para a tela os pontos novos (com o último já desenhado, para emendar) */
    private fun flush() { flushStroke(cur ?: return) }
    private fun flushStroke(c: Stroke) {
        if (c.dead) return
        val P = c.f.pts; if (P.size <= c.sent) return
        val from = if (c.sent >= 3) c.sent - 3 else 0
        val n = (P.size - from) / 3; val out = FloatArray(n * 3); val d = c.st.dpr
        for (k in 0 until n) {
            val i = from + k * 3
            out[k * 3] = P[i] * d; out[k * 3 + 1] = P[i + 1] * d
            out[k * 3 + 2] = radius(c.st, P[i + 2]) * d
        }
        c.sent = P.size; c.segs.add(out)
        r?.renderFrontBufferedLayer(Seg(c, out))
    }

    /* raio como penRadii da web: esferográfica = metade da espessura; natural = penRadius(w, p) */
    private fun radius(st: Style, p: Float) = if (st.natural) st.w / 2 * (0.35f + 1.3f * p.coerceIn(0f, 1f)) else st.w / 2

    /* v1.2.3: diagnóstico — últimos 5 traços como o Android desenhou (px CSS), lidos pela web no relatório de problema visual */
    private val hist = ArrayDeque<String>()
    fun debugJson(): String = synchronized(hist) { "[" + hist.joinToString(",") + "]" }
    private fun remember(c: Stroke, raw: Int) {
        val P = c.f.pts; val sb = StringBuilder()
        var i = 0; while (i < P.size) { if (i > 0) sb.append(','); sb.append(Math.round(P[i] * 10) / 10.0).append(',').append(Math.round(P[i + 1] * 10) / 10.0); i += 3 }
        val j = "{\"id\":${c.id},\"dpr\":${c.st.dpr},\"w\":${c.st.w},\"stab\":${c.st.stab},\"brutos\":$raw,\"pts\":[$sb]}"
        synchronized(hist) { hist.addLast(j); while (hist.size > 5) hist.removeFirst() }
    }
    private var rawCount = 0

    /* v1.2.5: ao levantar, o fim do traço espera a página dizer onde ele termina (inkEnd) — o Android recebe amostras finais
       que não chegam ao WebView, e o traço gravado terminava alguns px antes. Sem resposta em 250 ms, termina sozinho. */
    private var ending: Stroke? = null
    private var endT: Runnable? = null
    private fun end() {
        val c = cur ?: return; cur = null
        if (c.dead) return
        ending = c; val t = Runnable { finalizeEnd(c, null) }; endT = t; main.postDelayed(t, 250)
    }
    private fun finalizeEnd(c: Stroke, pt: FloatArray?) {
        if (ending !== c) return
        ending = null; endT?.let { main.removeCallbacks(it) }; endT = null
        if (c.dead) return
        val P = c.f.pts
        if (pt != null) { if (P.size >= 3) P.add(pt[0], pt[1], P[P.size - 1]) } else c.f.finish()
        flushStroke(c)
        try { remember(c, rawCount) } catch (_: Exception) {}
        done.add(c); r?.commit() // o traço passa para a camada "guardada" até a web pedir para tirar
    }
    fun endFrom(id: Int, x: Float, y: Float) { main.post { val c = ending; if (c != null && c.id == id) finalizeEnd(c, floatArrayOf(x, y)) } }

    private fun kill(c: Stroke) { c.dead = true; done.remove(c); r?.cancel(); r?.renderMultiBufferedLayer(emptyList()) }

    /* ---------- pedidos da web (outra linha de execução) ---------- */
    fun go(json: String): Int {
        if (!ok) return 0
        val latch = CountDownLatch(1); var id = 0; var gone = false
        main.post { synchronized(lock) { if (!gone) id = goUi(json) }; latch.countDown() }
        if (!latch.await(120, TimeUnit.MILLISECONDS)) synchronized(lock) { gone = true }
        return synchronized(lock) { id }
    }

    private fun goUi(json: String): Int {
        if (!down || cur != null || r == null) return 0 // a caneta já levantou (toque rápido): a web desenha sozinha
        val st = try {
            val o = JSONObject(json); val d = o.optDouble("dpr", 1.0).toFloat(); val c = o.getJSONArray("clip")
            Style(Color.parseColor(o.getString("color")), o.getDouble("w").toFloat(), o.optString("pen") == "natural",
                o.optDouble("sens", 0.6).toFloat(), o.optInt("stab", 10), d,
                RectF(c.getDouble(0).toFloat() * d, c.getDouble(1).toFloat() * d, c.getDouble(2).toFloat() * d, c.getDouble(3).toFloat() * d))
        } catch (_: Exception) { return 0 }
        val s = Stroke(nextId++, st)
        for (i in 0 until buf.size step 3) s.f.add(buf[i] / st.dpr, buf[i + 1] / st.dpr, buf[i + 2])
        buf.clear(); cur = s; flush()
        return s.id
    }

    fun clear(ids: String) { main.post { clearUi(ids) } }

    private fun clearUi(ids: String) {
        val rr = r ?: return
        if (ids == "all") { ending?.dead = true; ending = null; cur?.dead = true; cur = null; done.forEach { it.dead = true }; done.clear(); rr.cancel(); rr.clear(); return }
        val set = ids.split(',').mapNotNull { it.trim().toIntOrNull() }.toSet()
        val c = cur
        if (c != null && c.id in set && !c.dead) { c.dead = true; rr.cancel() } // virou forma etc.: some agora
        val en = ending; if (en != null && en.id in set) { en.dead = true; ending = null; rr.cancel() }
        val gone = done.filter { it.id in set }
        if (gone.isNotEmpty()) {
            gone.forEach { it.dead = true }; done.removeAll(gone.toSet())
            if (done.isEmpty() && (cur == null || cur!!.dead)) rr.clear() else rr.renderMultiBufferedLayer(emptyList())
        }
    }

    /* ---------- desenho (linha de renderização) ---------- */
    private fun draw(cv: Canvas, p: FloatArray, color: Int, line: Paint, dot: Paint) {
        val n = p.size / 3; if (n == 0) return
        line.color = color; dot.color = color
        if (n == 1) { cv.drawCircle(p[0], p[1], p[2], dot); return }
        for (i in 1 until n) {
            line.strokeWidth = p[i * 3 - 1] + p[i * 3 + 2]
            cv.drawLine(p[i * 3 - 3], p[i * 3 - 2], p[i * 3], p[i * 3 + 1], line)
        }
    }

    override fun onDrawFrontBufferedLayer(canvas: Canvas, bufferWidth: Int, bufferHeight: Int, param: Seg) {
        val s = param.s; if (s.dead) return
        canvas.save(); canvas.clipRect(s.st.clip); draw(canvas, param.p, s.st.color, pF, dF); canvas.restore()
    }

    override fun onDrawMultiBufferedLayer(canvas: Canvas, bufferWidth: Int, bufferHeight: Int, params: Collection<Seg>) {
        canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
        for (s in done) {
            if (s.dead) continue
            canvas.save(); canvas.clipRect(s.st.clip)
            for (p in s.segs) draw(canvas, p, s.st.color, pM, dM)
            canvas.restore()
        }
    }
}
