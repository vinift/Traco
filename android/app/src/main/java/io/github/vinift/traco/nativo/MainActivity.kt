package io.github.vinift.traco.nativo

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.MotionEvent
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebViewFeature
import io.github.vinift.traco.nativo.ink.InkView
import org.json.JSONObject

/**
 * Traço Nativo: a parte web vem do site (como no app atual) dentro de um WebView;
 * por cima dele fica a camada de tinta nativa (InkView), que desenha o traço enquanto a caneta escreve.
 * Ponte com a web: Bridge (window.TracoNative) ↔ js/native.js (Native).
 */
class MainActivity : ComponentActivity() {
    companion object {
        const val HOME = "https://vinift.github.io/Traco/"
        const val HOST = "vinift.github.io"
    }

    lateinit var web: WebView
    lateinit var ink: InkView
    lateinit var bridge: Bridge
    val inbox by lazy { Inbox(this) }
    private var loaded = false

    /* seletor de arquivos (<input type=file>) */
    private var fileCb: ValueCallback<Array<Uri>>? = null
    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r: ActivityResult ->
        /* v1.37.1: vários arquivos de uma vez chegam em clipData (o parseResult só lê data.data → devolvia null e a página
           ficava esperando para sempre) */
        val d = r.data
        val c = d?.clipData
        val uris: Array<Uri>? = if (r.resultCode != android.app.Activity.RESULT_OK || d == null) null
            else if (c != null && c.itemCount > 0) Array(c.itemCount) { c.getItemAt(it).uri }
            else WebChromeClient.FileChooserParams.parseResult(r.resultCode, d)
        fileCb?.onReceiveValue(uris); fileCb = null
    }
    /* tela de permissão do Google (Drive) */
    var authCb: ((Intent?) -> Unit)? = null
    val authLauncher = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { r -> authCb?.invoke(r.data); authCb = null }
    /* permissão de notificações */
    val notifyPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) window.attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        immersive()

        WebView.setWebContentsDebuggingEnabled(true) // chrome://inspect no computador, para depurar
        web = WebView(this)
        ink = InkView(this)
        bridge = Bridge(this)
        val root = FrameLayout(this)
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        root.addView(ink, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false); builtInZoomControls = false; displayZoomControls = false
            textZoom = 100 // o tamanho de fonte do sistema não deve mudar o layout do app
            setSupportMultipleWindows(false)
            allowFileAccess = false
            userAgentString = "$userAgentString TracoNativo/${BuildConfigLite.version(this@MainActivity)}"
        }
        web.addJavascriptInterface(bridge, "TracoNative")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val u = req.url
                if (u.host == HOST && u.path?.startsWith("/Traco") == true) return false
                openExternal(u.toString()); return true // Drive, GitHub, etc.: fora do app
            }
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? = inbox.intercept(req.url)
            override fun onPageFinished(view: WebView, url: String) { loaded = true; if (inbox.hasAny()) bridge.event("inbox", null) }
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(object : ServiceWorkerClientCompat() {
                override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? = inbox.intercept(request.url)
            })
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                fileCb?.onReceiveValue(null); fileCb = cb
                return try { pickFiles.launch(p.createIntent()); true } catch (e: Exception) { fileCb = null; false }
            }
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            /* v1.20.1: o voltar pergunta primeiro à página (Nav.nativeBack): sem entradas no histórico (nota reaberta sozinha
               ao voltar para o app) o canGoBack era falso e o app ia para o fundo em vez de fechar a nota */
            override fun handleOnBackPressed() {
                web.evaluateJavascript("(function(){try{return window.__tracoBack?window.__tracoBack():'none'}catch(e){return 'none'}})()") { r ->
                    when (r?.trim('"')) {
                        "ok" -> {}
                        "exit" -> moveTaskToBack(true)
                        else -> if (web.canGoBack()) web.goBack() else moveTaskToBack(true)
                    }
                }
            }
        })

        handleIntent(intent)
        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        if (web.url == null) web.loadUrl(HOME)
    }

    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); web.saveState(outState) }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); handleIntent(intent) }
    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus); if (hasFocus) immersive() }
    override fun onResume() { super.onResume(); web.onResume() }
    override fun onPause() { web.onPause(); super.onPause() }

    /* tela cheia "fixa": as barras do sistema aparecem por cima ao puxar da borda e somem sozinhas (sem empurrar a tela) */
    private fun immersive() {
        val c = WindowCompat.getInsetsController(window, window.decorView)
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        c.hide(WindowInsetsCompat.Type.systemBars())
    }

    /* a caneta passa primeiro pela tinta nativa e depois segue normalmente para a página */
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.pointerCount > 0 && ev.getToolType(0) == MotionEvent.TOOL_TYPE_STYLUS) {
            if (ev.actionMasked == MotionEvent.ACTION_DOWN) web.requestUnbufferedDispatch(ev) // pontos chegam assim que o sensor lê, sem esperar o quadro
            ink.onPen(ev)
        }
        return super.dispatchTouchEvent(ev)
    }

    private fun handleIntent(i: Intent?) {
        if (i == null) return
        i.getStringExtra("timerAction")?.let { a -> i.removeExtra("timerAction"); bridge.event("timer", a) }
        if (inbox.take(i) && loaded) bridge.event("inbox", null)
    }

    fun openExternal(url: String) {
        val uri = Uri.parse(url)
        if (uri.host?.endsWith("tecconcursos.com.br") == true && openTec(uri)) return
        try { startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
    }

    /* v1.39.2: link do TEC → app do TEC Concursos (se instalado), não o navegador.
       1) um app que não é navegador e abre esse link (mesmo sem "abrir links compatíveis" ligado) → abre a questão nele;
       2) senão, abre o app do TEC na tela inicial e copia o link da questão; 3) senão, navegador (false). */
    @Suppress("DEPRECATION")
    private fun openTec(uri: Uri): Boolean {
        val pm = packageManager
        return try {
            val view = Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)
            val browsers = pm.queryIntentActivities(Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com/a")).addCategory(Intent.CATEGORY_BROWSABLE), PackageManager.MATCH_ALL).map { it.activityInfo.packageName }.toSet()
            val app = pm.queryIntentActivities(view, PackageManager.MATCH_ALL).firstOrNull { it.activityInfo.packageName !in browsers && it.activityInfo.packageName != packageName }
            if (app != null) {
                startActivity(Intent(view).setClassName(app.activityInfo.packageName, app.activityInfo.name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true
            }
            val tec = pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0).firstOrNull { r ->
                val p = r.activityInfo.packageName.lowercase(); val l = r.loadLabel(pm).toString().lowercase().trim()
                p.contains("tecconcursos") || p.contains("tec.concursos") || l == "tec concursos" || l == "tecconcursos"
            } ?: return false
            val launch = pm.getLaunchIntentForPackage(tec.activityInfo.packageName) ?: return false
            (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Questão do TEC", uri.toString()))
            Toast.makeText(this, "Abrindo o app do TEC. O link da questão foi copiado.", Toast.LENGTH_LONG).show()
            startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
        } catch (_: Exception) { false }
    }

    fun js(code: String) { runOnUiThread { web.evaluateJavascript(code, null) } }
    fun quote(s: String?): String = if (s == null) "null" else JSONObject.quote(s)
}

/* versão do app (sem depender do BuildConfig) */
object BuildConfigLite {
    fun version(a: android.content.Context): String = try {
        a.packageManager.getPackageInfo(a.packageName, 0).versionName ?: "?"
    } catch (_: Exception) { "?" }
}
