package mw.dtps.app

import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

class DTPSFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "DTPSFirebaseMsgService"
        
        // Broadcast action for foreground notifications
        const val ACTION_FOREGROUND_NOTIFICATION = "com.dtps.dietary.FOREGROUND_NOTIFICATION"
        const val EXTRA_NOTIFICATION_DATA = "notification_data"
        
        // Notification channels
        const val CHANNEL_ID_DEFAULT = "dtps_notifications"
        const val CHANNEL_ID_MESSAGES = "dtps_messages"
        const val CHANNEL_ID_APPOINTMENTS = "dtps_appointments"
        const val CHANNEL_ID_PAYMENTS = "dtps_payments"
        const val CHANNEL_ID_TASKS = "dtps_tasks"
        const val CHANNEL_ID_CALLS = "dtps_calls"
        
        private const val CHANNEL_NAME_DEFAULT = "DTPS Notifications"
        private const val CHANNEL_NAME_MESSAGES = "Messages"
        private const val CHANNEL_NAME_APPOINTMENTS = "Appointments"
        private const val CHANNEL_NAME_PAYMENTS = "Payments"
        private const val CHANNEL_NAME_TASKS = "Tasks & Goals"
        private const val CHANNEL_NAME_CALLS = "Calls"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.d(TAG, "From: ${remoteMessage.from}")

        // Check if message contains data payload
        if (remoteMessage.data.isNotEmpty()) {
            Log.d(TAG, "Message data payload: ${remoteMessage.data}")
            handleDataMessage(remoteMessage.data)
        }

        // Check if message contains notification payload
        remoteMessage.notification?.let {
            Log.d(TAG, "Message Notification Body: ${it.body}")
            // Always show notification from data if available for consistency
            if (remoteMessage.data.isEmpty()) {
                showNotification(it.title ?: "DTPS", it.body ?: "", emptyMap())
            }
        }
    }

    /**
     * Check if the app is in foreground
     */
    private fun isAppInForeground(): Boolean {
        val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val appProcesses = activityManager.runningAppProcesses ?: return false
        val packageName = packageName
        for (appProcess in appProcesses) {
            if (appProcess.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND &&
                appProcess.processName == packageName) {
                return true
            }
        }
        return false
    }

    /**
     * Send foreground notification to WebView via broadcast
     */
    private fun sendForegroundNotificationToWebView(title: String, body: String, data: Map<String, String>) {
        try {
            val jsonData = JSONObject()
            jsonData.put("title", title)
            jsonData.put("body", body)
            
            val dataObj = JSONObject()
            data.forEach { (key, value) -> dataObj.put(key, value) }
            jsonData.put("data", dataObj)
            
            val intent = Intent(ACTION_FOREGROUND_NOTIFICATION).apply {
                putExtra(EXTRA_NOTIFICATION_DATA, jsonData.toString())
            }
            LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
            Log.d(TAG, "Foreground notification broadcast sent: $title")
        } catch (e: Exception) {
            Log.e(TAG, "Error sending foreground notification broadcast", e)
        }
    }

    override fun onNewToken(token: String) {
        Log.d(TAG, "Refreshed token: $token")
        sendTokenToWebView(token)
    }

    private fun handleDataMessage(data: Map<String, String>) {
        val title = data["title"] ?: "DTPS"
        val body = data["body"] ?: data["message"] ?: ""
        
        // If app is in foreground, send to WebView for toast display
        if (isAppInForeground()) {
            sendForegroundNotificationToWebView(title, body, data)
        }
        
        // Always show system notification (for background and to persist in notification tray)
        showNotification(title, body, data)
    }

    private fun sendTokenToWebView(token: String) {
        // Store token in shared preferences for the WebView to access
        val prefs = getSharedPreferences("dtps_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("fcm_token", token).apply()
    }
    
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build()

            // Default channel
            val defaultChannel = NotificationChannel(
                CHANNEL_ID_DEFAULT,
                CHANNEL_NAME_DEFAULT,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "General DTPS notifications"
                enableVibration(true)
                enableLights(true)
                lightColor = Color.GREEN
                setSound(defaultSoundUri, audioAttributes)
            }
            notificationManager.createNotificationChannel(defaultChannel)

            // Messages channel - highest priority
            val messagesChannel = NotificationChannel(
                CHANNEL_ID_MESSAGES,
                CHANNEL_NAME_MESSAGES,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Chat messages from dietitians"
                enableVibration(true)
                enableLights(true)
                lightColor = Color.BLUE
                setSound(defaultSoundUri, audioAttributes)
                setShowBadge(true)
            }
            notificationManager.createNotificationChannel(messagesChannel)

            // Appointments channel
            val appointmentsChannel = NotificationChannel(
                CHANNEL_ID_APPOINTMENTS,
                CHANNEL_NAME_APPOINTMENTS,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Appointment reminders and updates"
                enableVibration(true)
                enableLights(true)
                lightColor = Color.CYAN
                setSound(defaultSoundUri, audioAttributes)
            }
            notificationManager.createNotificationChannel(appointmentsChannel)

            // Payments channel
            val paymentsChannel = NotificationChannel(
                CHANNEL_ID_PAYMENTS,
                CHANNEL_NAME_PAYMENTS,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Payment requests and confirmations"
                enableVibration(true)
                enableLights(true)
                lightColor = Color.YELLOW
                setSound(defaultSoundUri, audioAttributes)
            }
            notificationManager.createNotificationChannel(paymentsChannel)

            // Tasks channel
            val tasksChannel = NotificationChannel(
                CHANNEL_ID_TASKS,
                CHANNEL_NAME_TASKS,
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Task assignments and goal reminders"
                enableVibration(true)
                enableLights(true)
                lightColor = Color.MAGENTA
                setSound(defaultSoundUri, audioAttributes)
            }
            notificationManager.createNotificationChannel(tasksChannel)

            // Calls channel - highest priority
            val callsChannel = NotificationChannel(
                CHANNEL_ID_CALLS,
                CHANNEL_NAME_CALLS,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Incoming video/audio calls"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500, 200, 500)
                enableLights(true)
                lightColor = Color.RED
                setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), audioAttributes)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
            }
            notificationManager.createNotificationChannel(callsChannel)
        }
    }
    
    private fun getChannelForType(type: String?): String {
        return when (type) {
            "new_message", "message" -> CHANNEL_ID_MESSAGES
            "appointment", "appointment_booked", "appointment_cancelled", "appointment_reminder" -> CHANNEL_ID_APPOINTMENTS
            "payment_link", "payment_link_created", "payment" -> CHANNEL_ID_PAYMENTS
            "task_assigned", "meal_plan", "meal_plan_created", "meal_plan_updated" -> CHANNEL_ID_TASKS
            "call", "incoming_call" -> CHANNEL_ID_CALLS
            else -> CHANNEL_ID_DEFAULT
        }
    }

    private fun showNotification(title: String, messageBody: String, data: Map<String, String>) {
        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            // Add data to intent for handling notification clicks
            data.forEach { (key, value) ->
                putExtra(key, value)
            }
        }
        
        val pendingIntent = PendingIntent.getActivity(
            this, 
            System.currentTimeMillis().toInt(),
            intent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )

        val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val notificationType = data["type"]
        val channelId = getChannelForType(notificationType)
        
        val notificationBuilder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(messageBody)
            .setAutoCancel(true)
            .setSound(defaultSoundUri)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setStyle(NotificationCompat.BigTextStyle().bigText(messageBody))

        // Add specific styling based on notification type
        when (notificationType) {
            "new_message", "message" -> {
                notificationBuilder.setColor(Color.BLUE)
                notificationBuilder.setCategory(NotificationCompat.CATEGORY_MESSAGE)
            }
            "call", "incoming_call" -> {
                notificationBuilder.setColor(Color.RED)
                notificationBuilder.setCategory(NotificationCompat.CATEGORY_CALL)
                notificationBuilder.setOngoing(true)
            }
            "appointment", "appointment_booked" -> {
                notificationBuilder.setColor(Color.CYAN)
                notificationBuilder.setCategory(NotificationCompat.CATEGORY_EVENT)
            }
            "payment_link", "payment_link_created" -> {
                notificationBuilder.setColor(Color.parseColor("#FF9800"))
                notificationBuilder.setCategory(NotificationCompat.CATEGORY_PROMO)
            }
            "task_assigned", "meal_plan", "meal_plan_created" -> {
                notificationBuilder.setColor(Color.MAGENTA)
                notificationBuilder.setCategory(NotificationCompat.CATEGORY_REMINDER)
            }
        }

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Create notification channel for Android O and above (already done in onCreate, but ensure it exists)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            createNotificationChannels()
        }

        // Use a unique ID based on type to allow grouping
        val notificationId = when (notificationType) {
            "new_message", "message" -> (data["conversationId"]?.hashCode() ?: System.currentTimeMillis().toInt())
            else -> System.currentTimeMillis().toInt()
        }

        notificationManager.notify(notificationId, notificationBuilder.build())
    }
}
