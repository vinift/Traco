package io.github.vinift.traco.nativo

import android.Manifest
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import android.view.WindowManager
import android.webkit.JavascriptInterface
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap

/**
 * window.TracoNative — tudo que a web (js/native.js) pode pedir ao Android.
 * Os métodos rodam numa linha de execução do WebView (não na da tela): o que mexe na tela vai por runOnUiThread.
 * Respostas demoradas voltam por Native._cb(id, json); avisos por Native._ev(tipo, dado).
 */
class Bridge(private val a: MainActivity) {
    private class Out(val name: String, val mime: String, val file: File, val stream: FileOutputStream)
    private val outs = ConcurrentHashMap<Int, Out>()
    private var nextOut = 1

    fun event(type: String, data: String?) = a.js("window.Native&&Native._ev(${a.quote(type)},${a.quote(data)})")
    private fun reply(id: Int, o: JSONObject) = a.js("window.Native&&Native._cb($id,${a.quote(o.toString())})")

    @JavascriptInterface fun info(): String = JSONObject()
        .put("app", "nativo").put("ver", BuildConfigLite.version(a)).put("sdk", Build.VERSION.SDK_INT)
        .put("ink", a.ink.supported()).put("page", a.pageOk).toString()

    /* ---- tinta ---- */
    /* v1.45.10: diagnóstico de memória para o relatório de bug — lido numa thread a cada 2,5 s (getMemoryInfo é lento); a web lê o último */
    @Volatile private var memJson = "{}"
    @Volatile private var memAt = 0L
    @JavascriptInterface fun memStat(): String {
        val now = System.currentTimeMillis()
        if (now - memAt > 2500) { memAt = now; Thread { memJson = readMem() }.start() }
        return memJson
    }
    private fun readMem(): String = try {
        val mi = android.os.Debug.MemoryInfo(); android.os.Debug.getMemoryInfo(mi)
        val am = a.getSystemService(android.content.Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        val si = android.app.ActivityManager.MemoryInfo(); am.getMemoryInfo(si)
        fun st(k: String): Long = (mi.getMemoryStat(k)?.toLongOrNull() ?: -1024L) / 1024L
        JSONObject().put("gfx", st("summary.graphics")).put("pss", st("summary.total-pss")).put("java", st("summary.java-heap"))
            .put("nat", st("summary.native-heap")).put("livre", si.availMem / 1048576L).put("baixa", si.lowMemory)
            .put("limite", si.threshold / 1048576L).put("t", System.currentTimeMillis()).toString()
    } catch (e: Exception) { JSONObject().put("erro", e.message ?: "?").toString() }

    /* v1.46: desenho nativo da nota (page/PageView.kt; os pixels chegam pelo canal binário criado no MainActivity.pgChannel) */
    @JavascriptInterface fun pgPlace(id: Int, L: Double, x: Double, y: Double) = a.page.place(id, L, x.toFloat(), y.toFloat())
    @JavascriptInterface fun pgPrev(pid: String, id: Int) = a.page.prev(pid, id)
    @JavascriptInterface fun pgFree(id: Int) = a.page.free(id)
    @JavascriptInterface fun pgFrames(json: String) = a.page.frames(json)
    @JavascriptInterface fun pgScene(json: String) = a.page.scene(json)
    @JavascriptInterface fun pgClear() = a.page.clear()
    @JavascriptInterface fun pgStat(): String = a.page.stat()
    /* v1.46.1: print da janela inteira (WebView + página nativa; a tinta ao vivo, que é outra superfície, não entra) para o relatório de bug.
       Responde {jpg: base64} (escala 0,1–1, JPEG 72) ou {error} */
    @JavascriptInterface fun screenshot(id: Int, scale: Double) {
        a.runOnUiThread {
            try {
                val v = a.window.decorView; val w = v.width; val h = v.height
                if (w <= 0 || h <= 0) { reply(id, JSONObject().put("error", "sem tela")); return@runOnUiThread }
                val bmp = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
                android.view.PixelCopy.request(a.window, bmp, { r ->
                    if (r != android.view.PixelCopy.SUCCESS) { bmp.recycle(); reply(id, JSONObject().put("error", "PixelCopy $r")); return@request }
                    Thread {
                        try {
                            val k = scale.coerceIn(0.1, 1.0); val sc = android.graphics.Bitmap.createScaledBitmap(bmp, (w * k).toInt().coerceAtLeast(1), (h * k).toInt().coerceAtLeast(1), true)
                            val out = java.io.ByteArrayOutputStream(); sc.compress(android.graphics.Bitmap.CompressFormat.JPEG, 72, out)
                            if (sc !== bmp) sc.recycle(); bmp.recycle()
                            reply(id, JSONObject().put("jpg", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)))
                        } catch (e: Throwable) { reply(id, JSONObject().put("error", e.message ?: "erro")) }
                    }.start()
                }, android.os.Handler(android.os.Looper.getMainLooper()))
            } catch (e: Throwable) { reply(id, JSONObject().put("error", e.message ?: "erro")) }
        }
    }

    @JavascriptInterface fun inputLog(): String = synchronized(a.inLog) { JSONArray(a.inLog.toList()).toString() }
    @JavascriptInterface fun inkGo(style: String): Int = a.ink.go(style)
    @JavascriptInterface fun inkClear(ids: String) = a.ink.clear(ids)
    @JavascriptInterface fun inkDebug(): String = a.ink.debugJson()
    @JavascriptInterface fun inkPts(id: Int): String = a.ink.ptsJson(id)
    @JavascriptInterface fun inkEnd(id: Int, x: Double, y: Double) = a.ink.endFrom(id, x.toFloat(), y.toFloat())

    /* ---- arquivos para fora: a web manda em pedaços base64 ---- */
    @JavascriptInterface fun fileBegin(name: String, mime: String): Int {
        val dir = File(a.cacheDir, "out").apply { mkdirs() }
        val id = synchronized(this) { nextOut++ }
        val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "arquivo" }
        val f = File(dir, "$id-$safe")
        outs[id] = Out(safe, mime, f, FileOutputStream(f))
        return id
    }
    @JavascriptInterface fun fileChunk(id: Int, b64: String) { outs[id]?.stream?.write(Base64.decode(b64, Base64.DEFAULT)) }
    private fun close(id: Int): Out? = outs.remove(id)?.also { try { it.stream.close() } catch (_: Exception) {} }

    @JavascriptInterface fun shareFiles(ids: String, title: String): String {
        val list = ids.split(',').mapNotNull { it.trim().toIntOrNull() }.mapNotNull { close(it) }
        if (list.isEmpty()) return "nenhum arquivo"
        return try {
            val uris = ArrayList(list.map { FileProvider.getUriForFile(a, a.packageName + ".files", it.file) })
            val i = if (uris.size == 1) Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris[0])
                    else Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            i.type = if (list.all { it.mime == list[0].mime }) list[0].mime else "*/*"
            if (title.isNotBlank()) i.putExtra(Intent.EXTRA_SUBJECT, title)
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            a.runOnUiThread { a.startActivity(Intent.createChooser(i, title.ifBlank { "Compartilhar" })) }
            ""
        } catch (e: Exception) { e.message ?: "erro" }
    }
    @JavascriptInterface fun shareText(text: String, title: String): String = try {
        val i = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        a.runOnUiThread { a.startActivity(Intent.createChooser(i, title.ifBlank { "Compartilhar" })) }; ""
    } catch (e: Exception) { e.message ?: "erro" }

    /* salvar na pasta Downloads (sem pedir permissão) */
    @JavascriptInterface fun saveFile(id: Int): String {
        val o = close(id) ?: return "arquivo não encontrado"
        return try {
            val v = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, o.name); put(MediaStore.Downloads.MIME_TYPE, o.mime)
                put(MediaStore.Downloads.RELATIVE_PATH, "Download/Traço")
            }
            val uri = a.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v) ?: return "sem acesso à pasta Downloads"
            a.contentResolver.openOutputStream(uri)?.use { out -> o.file.inputStream().use { it.copyTo(out) } }
            o.file.delete(); ""
        } catch (e: Exception) { e.message ?: "erro" }
    }

    /* ---- tela acesa ---- */
    @JavascriptInterface fun keepScreen(on: Boolean) = a.runOnUiThread {
        if (on) a.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else a.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    /* ---- notificações e alarme ---- */
    @JavascriptInterface fun notifyOk(): Boolean = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(a, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    @JavascriptInterface fun notifyAsk() { if (Build.VERSION.SDK_INT >= 33) a.runOnUiThread { a.notifyPerm.launch(Manifest.permission.POST_NOTIFICATIONS) } }
    @JavascriptInterface fun notify(tag: String, title: String, body: String, opts: String) {
        val o = try { JSONObject(opts) } catch (_: Exception) { JSONObject() }
        val acts = o.optJSONArray("actions") ?: JSONArray()
        Notify.show(a, tag, title, body, o.optBoolean("silent", true), o.optBoolean("sticky", false),
            (0 until acts.length()).map { acts.getJSONArray(it).let { x -> x.getString(0) to x.getString(1) } })
    }
    @JavascriptInterface fun notifyCancel(tag: String) = Notify.cancel(a, tag)
    @JavascriptInterface fun alarmAt(at: Double, title: String, body: String) = Notify.alarmAt(a, at.toLong(), title, body)
    @JavascriptInterface fun alarmCancel() = Notify.alarmCancel(a)

    /* ---- Drive ---- */
    /* v1.3.1: o Google Play guarda a chave de acesso; se o Drive a recusou (401), esquece para a próxima vir nova */
    @JavascriptInterface fun driveForget(id: Int, token: String) {
        Thread {
            try { com.google.android.gms.auth.GoogleAuthUtil.clearToken(a, token) } catch (_: Exception) {}
            reply(id, JSONObject().put("ok", true))
        }.start()
    }
    @JavascriptInterface fun driveAuth(id: Int, interactive: Boolean) = a.runOnUiThread {
        DriveAuth.authorize(a, interactive) { res -> reply(id, res) }
    }

    /* ---- outros ---- */
    @JavascriptInterface fun openExternal(url: String) = a.openExternal(url)
    @JavascriptInterface fun inbox(): String = a.inbox.list()
    @JavascriptInterface fun inboxDone(id: String) = a.inbox.done(id)
}
