package mw.dtps.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

class DTPSApplication : Application() {
    
    companion object {
        private const val TAG = "DTPSApplication"
        private const val CHANNEL_ID = "dtps_notifications"
        private const val CHANNEL_NAME = "DTPS Notifications"
    }
    
    override fun onCreate() {
        super.onCreate()
        
        // Initialize Firebase - will be used when app is open
        FirebaseApp.initializeApp(this)
        
        // Create notification channel
        createNotificationChannel()
        
        // Don't automatically get FCM token on app startup
        // FCM token will be fetched on-demand when needed by MainActivity
        Log.d(TAG, "Application initialized - Firebase ready for on-demand use")
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications from DTPS app including messages, appointments, tasks, and meal plans"
                enableVibration(true)
                enableLights(true)
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
}
