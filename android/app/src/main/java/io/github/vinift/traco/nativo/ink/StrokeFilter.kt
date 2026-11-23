package io.github.vinift.traco.nativo.ink

import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * Mesma estabilização da web (Editor.addDrawPoint em js/editor.js, v0.37.1) e mesma pressão (mapPressure em js/toolbar.js),
 * em px de TELA (CSS) — a web faz a conta em unidades da página × zoom, que dá o mesmo.
 * Se mudar lá, mude aqui (e vice-versa) para a tinta ao vivo bater com o traço gravado.
 * Pensado para ser reaproveitado se um dia o editor inteiro virar nativo.
 */
class StrokeFilter(stab: Int, private val sens: Float) {
    private val L = stab.coerceIn(0, 20)
    private val X = max(0, L - 10)
    private val rope = max(0, min(L, 10) - 8) * 0.45f + X * 1.1f
    private val sb = (L / 10f).coerceIn(0f, 1f)
    private val kb = 1 - sb * 0.75f - X * 0.0145f
    private val div = 40 + 80 * sb + X * 14

    /** pontos aceitos: x, y, pressão (0–1) */
    val pts = FloatList()
    private var rawX = Float.NaN
    private var rawY = 0f

    private fun pressure(raw: Float): Float = if (sens <= 0f) 0.5f else (0.5f + (raw - 0.5f) * sens * 1.8f).coerceIn(0.04f, 1f)

    /** devolve true se entrou ponto novo */
    fun add(x0: Float, y0: Float, rawP: Float): Boolean {
        val pr = pressure(if (rawP > 0f) rawP else 0.5f)
        val n = pts.size
        if (n == 0) { pts.add(x0, y0, pr); rawX = x0; rawY = y0; return true }
        val lx = pts[n - 3]; val ly = pts[n - 2]; val lp = pts[n - 1]
        var x = x0; var y = y0
        if (rope > 0f) {
            val d = hypot(x - lx, y - ly)
            if (d <= rope) { rawX = x0; rawY = y0; return false }
            val t = (d - rope) / d; x = lx + (x - lx) * t; y = ly + (y - ly) * t
        }
        val spd = hypot(x - lx, y - ly)
        val k = (kb + spd / div).coerceIn(kb, 1f)
        val nx = lx + (x - lx) * k; val ny = ly + (y - ly) * k
        if (hypot(nx - lx, ny - ly) < 0.35f) return false
        pts.add(nx, ny, lp + (pr - lp) * 0.45f); rawX = x0; rawY = y0
        return true
    }

    /** fim do traço: completa até onde a caneta realmente está (como o endDraw da web) */
    fun finish(): Boolean {
        val n = pts.size; if (n == 0 || rawX.isNaN()) return false
        if (hypot(pts[n - 3] - rawX, pts[n - 2] - rawY) > 0.5f) { pts.add(rawX, rawY, pts[n - 1]); return true }
        return false
    }
}

/** lista de floats sem caixas (pontos x, y, p) */
class FloatList(cap: Int = 384) {
    var a = FloatArray(cap)
    var size = 0
        private set
    operator fun get(i: Int) = a[i]
    fun clear() { size = 0 }
    fun add(x: Float, y: Float, p: Float) {
        if (size + 3 > a.size) a = a.copyOf(a.size * 2)
        a[size] = x; a[size + 1] = y; a[size + 2] = p; size += 3
    }
}
