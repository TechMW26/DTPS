package mw.dtps.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * DISABLED - App is user-initiated only and does not require background startup.
 * Background services were removed to pass Google Play Store review.
 * Keeping class for backwards compatibility in case of future re-enablement.
 */
class BootCompletedReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootCompletedReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        // Disabled - app does not support background initialization
        Log.d(TAG, "BootCompletedReceiver is disabled - app is user-initiated only")
    }
}
