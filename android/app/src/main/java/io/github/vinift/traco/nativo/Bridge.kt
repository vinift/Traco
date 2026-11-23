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
        .put("ink", a.ink.supported()).toString()

    /* ---- tinta ---- */
    @JavascriptInterface fun inkGo(style: String): Int = a.ink.go(style)
    @JavascriptInterface fun inkClear(ids: String) = a.ink.clear(ids)
    @JavascriptInterface fun inkDebug(): String = a.ink.debugJson()
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
    @JavascriptInterface fun driveAuth(id: Int, interactive: Boolean) = a.runOnUiThread {
        DriveAuth.authorize(a, interactive) { res -> reply(id, res) }
    }

    /* ---- outros ---- */
    @JavascriptInterface fun openExternal(url: String) = a.openExternal(url)
    @JavascriptInterface fun inbox(): String = a.inbox.list()
    @JavascriptInterface fun inboxDone(id: String) = a.inbox.done(id)
}
