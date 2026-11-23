package io.github.vinift.traco.nativo

import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import androidx.activity.result.IntentSenderRequest
import com.google.android.gms.common.api.ApiException
import org.json.JSONObject

/**
 * Login do Drive pela conta Google do Android (AuthorizationClient).
 * Precisa de um "ID do cliente OAuth" do tipo Android no MESMO projeto do Google Cloud do Traço,
 * com o nome do pacote io.github.vinift.traco.nativo e o SHA-1 da chave do APK (o GitHub Actions mostra o SHA-1).
 * Mesmo projeto = o escopo drive.file enxerga os arquivos que o site já criou.
 */
object DriveAuth {
    private const val SCOPE = "https://www.googleapis.com/auth/drive.file"

    /* mensagem com o código do Google (10 = DEVELOPER_ERROR: cliente Android não cadastrado / SHA-1 ou pacote errado / outro projeto; 16 = cancelado) */
    private fun msg(e: Exception): String { val c = (e as? ApiException)?.statusCode; return (e.message ?: "erro") + if (c != null && e.message?.contains(c.toString()) != true) " (código $c)" else "" }

    fun authorize(a: MainActivity, interactive: Boolean, done: (JSONObject) -> Unit) {
        val req = AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(SCOPE))).build()
        val client = Identity.getAuthorizationClient(a)
        client.authorize(req)
            .addOnSuccessListener { r ->
                val pi = r.pendingIntent
                if (r.hasResolution() && pi != null) {
                    if (!interactive) { done(JSONObject().put("error", "needAuth")); return@addOnSuccessListener }
                    a.authCb = { data ->
                        try {
                            val t = client.getAuthorizationResultFromIntent(data).accessToken
                            done(if (t != null) JSONObject().put("token", t) else JSONObject().put("error", "sem chave"))
                        } catch (e: Exception) { done(JSONObject().put("error", msg(e))) }
                    }
                    try { a.authLauncher.launch(IntentSenderRequest.Builder(pi.intentSender).build()) }
                    catch (e: Exception) { a.authCb = null; done(JSONObject().put("error", msg(e))) }
                } else {
                    val t = r.accessToken
                    done(if (t != null) JSONObject().put("token", t) else JSONObject().put("error", "sem chave"))
                }
            }
            .addOnFailureListener { e -> done(JSONObject().put("error", msg(e))) }
    }
}
