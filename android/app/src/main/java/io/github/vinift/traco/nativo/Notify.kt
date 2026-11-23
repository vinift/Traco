package io.github.vinift.traco.nativo

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** Notificações do cronômetro (mesmas "tags" da web: traco-timer e traco-timer-end) e o alarme marcado no Android. */
object Notify {
    private const val CH_TIMER = "timer"
    private const val CH_ALARM = "alarm"

    private fun channels(c: Context) {
        val m = c.getSystemService(NotificationManager::class.java)
        if (m.getNotificationChannel(CH_TIMER) == null) m.createNotificationChannel(
            NotificationChannel(CH_TIMER, "Cronômetro", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
        if (m.getNotificationChannel(CH_ALARM) == null) m.createNotificationChannel(
            NotificationChannel(CH_ALARM, "Alarme do cronômetro", NotificationManager.IMPORTANCE_HIGH).apply {
                enableVibration(true); vibrationPattern = longArrayOf(0, 300, 150, 300, 150, 600)
            })
    }

    private fun open(c: Context, code: Int, action: String?): PendingIntent {
        val i = Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        if (action != null) i.putExtra("timerAction", action)
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun show(c: Context, tag: String, title: String, body: String, silent: Boolean, sticky: Boolean, actions: List<Pair<String, String>>) {
        channels(c)
        val b = NotificationCompat.Builder(c, if (silent) CH_TIMER else CH_ALARM)
            .setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(body)
            .setContentIntent(open(c, tag.hashCode(), null)).setAutoCancel(!sticky || !silent)
            .setOngoing(sticky && silent).setOnlyAlertOnce(silent)
            .setPriority(if (silent) NotificationCompat.PRIORITY_LOW else NotificationCompat.PRIORITY_HIGH)
            .setCategory(if (silent) NotificationCompat.CATEGORY_PROGRESS else NotificationCompat.CATEGORY_ALARM)
        actions.forEachIndexed { k, (act, label) ->
            b.addAction(0, label, open(c, tag.hashCode() * 31 + k + 1, if (act == "open") null else act))
        }
        try { NotificationManagerCompat.from(c).notify(tag, 1, b.build()) } catch (_: SecurityException) {}
    }

    fun cancel(c: Context, tag: String) = NotificationManagerCompat.from(c).cancel(tag, 1)

    private fun alarmIntent(c: Context, title: String?, body: String?): PendingIntent {
        val i = Intent(c, AlarmReceiver::class.java).putExtra("title", title).putExtra("body", body)
        return PendingIntent.getBroadcast(c, 77, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun alarmAt(c: Context, at: Long, title: String, body: String) {
        val am = c.getSystemService(AlarmManager::class.java)
        val pi = alarmIntent(c, title, body)
        val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi) else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }

    fun alarmCancel(c: Context) = c.getSystemService(AlarmManager::class.java).cancel(alarmIntent(c, null, null))
}

/** Hora do alarme: mostra a notificação de fim (a mesma tag que a web usa, então não duplica). */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        Notify.show(c, "traco-timer-end", i.getStringExtra("title") ?: "⏰ Tempo esgotado!", i.getStringExtra("body") ?: "",
            silent = false, sticky = true, actions = listOf("open" to "Abrir"))
    }
}
