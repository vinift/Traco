package io.github.vinift.traco.nativo

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.webkit.WebResourceResponse
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream

/**
 * PDFs recebidos pelo "Abrir com" e pelo "Compartilhar": copiados para a pasta do app e entregues à web
 * pelo endereço .../Traco/__native/inbox/<id> (o sw.js deixa passar; aqui o WebView responde com o arquivo).
 */
class Inbox(private val a: MainActivity) {
    private val dir get() = File(a.filesDir, "inbox").apply { mkdirs() }

    fun take(i: Intent): Boolean {
        val uris = mutableListOf<Uri>()
        when (i.action) {
            Intent.ACTION_VIEW -> i.data?.let { uris += it }
            Intent.ACTION_SEND -> stream(i)?.let { uris += it }
            Intent.ACTION_SEND_MULTIPLE -> uris += streams(i)
        }
        if (uris.isEmpty()) return false
        i.action = Intent.ACTION_MAIN; i.data = null // não reabrir o mesmo arquivo ao girar a tela
        var any = false
        for (u in uris) try {
            val id = System.currentTimeMillis().toString(36) + (0..9999).random()
            val name = nameOf(u) ?: "documento.pdf"
            val mime = a.contentResolver.getType(u) ?: "application/pdf"
            a.contentResolver.openInputStream(u)?.use { inp -> File(dir, id).outputStream().use { inp.copyTo(it) } } ?: continue
            File(dir, "$id.json").writeText(JSONObject().put("id", id).put("name", name).put("mime", mime).toString())
            any = true
        } catch (_: Exception) {}
        return any
    }

    @Suppress("DEPRECATION")
    private fun stream(i: Intent): Uri? = if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableExtra(Intent.EXTRA_STREAM)
    @Suppress("DEPRECATION")
    private fun streams(i: Intent): List<Uri> = (if (Build.VERSION.SDK_INT >= 33) i.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableArrayListExtra(Intent.EXTRA_STREAM)) ?: emptyList()

    private fun nameOf(u: Uri): String? = try {
        a.contentResolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    } catch (_: Exception) { null } ?: u.lastPathSegment

    fun hasAny() = dir.listFiles { f -> f.name.endsWith(".json") }?.isNotEmpty() == true

    fun list(): String {
        val arr = JSONArray()
        dir.listFiles { f -> f.name.endsWith(".json") }?.sortedBy { it.lastModified() }?.forEach { f -> try { arr.put(JSONObject(f.readText())) } catch (_: Exception) {} }
        return arr.toString()
    }

    fun done(id: String) { if (id.matches(Regex("[a-z0-9]+"))) { File(dir, id).delete(); File(dir, "$id.json").delete() } }

    fun intercept(u: Uri): WebResourceResponse? {
        if (u.host != MainActivity.HOST) return null
        val p = u.path ?: return null
        val k = p.indexOf("/__native/inbox/"); if (k < 0) return null
        val id = p.substring(k + 16); if (!id.matches(Regex("[a-z0-9]+"))) return null
        val f = File(dir, id); if (!f.exists()) return WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), null)
        val mime = try { JSONObject(File(dir, "$id.json").readText()).optString("mime", "application/pdf") } catch (_: Exception) { "application/pdf" }
        return WebResourceResponse(mime, null, 200, "OK", mapOf("Cache-Control" to "no-store", "Access-Control-Allow-Origin" to "*"), FileInputStream(f))
    }
}
