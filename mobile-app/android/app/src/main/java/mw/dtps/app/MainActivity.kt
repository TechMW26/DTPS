package mw.dtps.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import android.view.View
import android.webkit.*
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.google.firebase.messaging.FirebaseMessaging
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var splashWebView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineView: View
    private lateinit var offlineText: TextView
    private lateinit var retryButton: View

    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var permissionCallback: PermissionRequest? = null
    private var splashComplete = false
    private val mainHandler = Handler(Looper.getMainLooper())
    
    // Camera photo URI
    private var cameraPhotoUri: Uri? = null
    
    // FCM token - proactively fetched
    private var cachedFCMToken: String? = null
    
    // Broadcast receiver for foreground notifications
    private val foregroundNotificationReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val notificationData = intent?.getStringExtra(DTPSFirebaseMessagingService.EXTRA_NOTIFICATION_DATA)
            if (!notificationData.isNullOrEmpty() && splashComplete && ::webView.isInitialized) {
                Log.d(TAG, "Received foreground notification broadcast: $notificationData")
                // Forward to WebView via JavaScript
                mainHandler.post {
                    // Properly escape the JSON string for JavaScript
                    val escapedData = notificationData
                        .replace("\\", "\\\\")    // Escape backslashes first
                        .replace("\"", "\\\"")    // Escape double quotes
                        .replace("'", "\\'")      // Escape single quotes
                        .replace("\n", "\\n")     // Escape newlines
                        .replace("\r", "\\r")     // Escape carriage returns
                        .replace("\t", "\\t")     // Escape tabs
                    
                    val jsCode = """
                        (function() {
                            try {
                                console.log('[Native] Processing foreground notification...');
                                var notification = JSON.parse("$escapedData");
                                console.log('[Native] Parsed notification:', JSON.stringify(notification));
                                
                                // Try global handler first
                                if (typeof window.onForegroundNotification === 'function') {
                                    console.log('[Native] Calling onForegroundNotification handler');
                                    window.onForegroundNotification(notification);
                                } else {
                                    console.log('[Native] No onForegroundNotification handler found');
                                }
                                
                                // Also dispatch custom event
                                window.dispatchEvent(new CustomEvent('nativeForegroundNotification', { detail: notification }));
                                console.log('[Native] Foreground notification forwarded to WebView');
                            } catch (e) {
                                console.error('[Native] Error handling foreground notification:', e);
                                console.error('[Native] Raw data:', "$escapedData");
                            }
                        })();
                    """.trimIndent()
                    
                    webView.evaluateJavascript(jsCode, null)
                }
            }
        }
    }

    companion object {
        private const val TAG = "MainActivity"
        private const val APP_URL = "https://dtps.tech/user"
        private const val SPLASH_URL = "file:///android_asset/splash.html"
        private val ALLOWED_HOSTS = listOf("dtps.tech")
    }

    // File picker launcher for gallery
    private val galleryPickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        fileUploadCallback?.onReceiveValue(uris.toTypedArray())
        fileUploadCallback = null
    }

    // Camera launcher
    private val cameraLauncher = registerForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        if (success && cameraPhotoUri != null) {
            fileUploadCallback?.onReceiveValue(arrayOf(cameraPhotoUri!!))
        } else {
            fileUploadCallback?.onReceiveValue(null)
        }
        fileUploadCallback = null
        cameraPhotoUri = null
    }

    // Combined picker (camera + gallery)
    private val combinedPickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            val data = result.data
            val uris = mutableListOf<Uri>()
            
            // Check if camera photo was taken
            if (cameraPhotoUri != null) {
                val file = File(cameraPhotoUri!!.path ?: "")
                if (file.exists() && file.length() > 0) {
                    uris.add(cameraPhotoUri!!)
                }
            }
            
            // Check for gallery selection
            data?.data?.let { uri -> 
                if (!uris.contains(uri)) {
                    uris.add(uri) 
                }
            }
            data?.clipData?.let { clipData ->
                for (i in 0 until clipData.itemCount) {
                    val uri = clipData.getItemAt(i).uri
                    if (!uris.contains(uri)) {
                        uris.add(uri)
                    }
                }
            }
            
            if (uris.isNotEmpty()) {
                fileUploadCallback?.onReceiveValue(uris.toTypedArray())
            } else {
                fileUploadCallback?.onReceiveValue(null)
            }
        } else {
            fileUploadCallback?.onReceiveValue(null)
        }
        fileUploadCallback = null
        cameraPhotoUri = null
    }

    private val multiplePermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ ->
        // All permissions handled
    }

    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        // MUST be called before super.onCreate() to disable edge-to-edge enforcement on Android 15+
        WindowCompat.setDecorFitsSystemWindows(window, true)
        
        super.onCreate(savedInstanceState)
        
        // Set up white status bar with dark icons - apply to all Android versions
        window.statusBarColor = ContextCompat.getColor(this, android.R.color.white)
        window.navigationBarColor = ContextCompat.getColor(this, android.R.color.white)
        
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }

        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        splashWebView = findViewById(R.id.splashWebView)
        progressBar = findViewById(R.id.progressBar)
        offlineView = findViewById(R.id.offlineView)
        offlineText = findViewById(R.id.offlineText)
        retryButton = findViewById(R.id.retryButton)

        setupSplashWebView()
        setupWebView()
        setupBackHandler()
        
        retryButton.setOnClickListener {
            loadUrl()
        }

        // Show splash first
        showSplash()
        
        // Proactively fetch FCM token
        fetchFCMToken()
        
        // Request permissions after a short delay
        mainHandler.postDelayed({
            requestAllPermissions()
        }, 500)
    }
    
    private fun fetchFCMToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val token = task.result
                Log.d(TAG, "FCM Token fetched: ${token?.take(30)}...")
                cachedFCMToken = token
                
                // Store in shared preferences
                val prefs = getSharedPreferences("dtps_prefs", Context.MODE_PRIVATE)
                prefs.edit().putString("fcm_token", token).apply()
                
                // Notify WebView that token is ready
                mainHandler.post {
                    if (splashComplete && ::webView.isInitialized) {
                        webView.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('fcmTokenReady', { detail: { token: '$token' } }));",
                            null
                        )
                    }
                }
            } else {
                Log.e(TAG, "Failed to fetch FCM token", task.exception)
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupSplashWebView() {
        splashWebView.settings.apply {
            javaScriptEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            loadWithOverviewMode = true
            useWideViewPort = true
        }

        // Add JavaScript interface for communication
        splashWebView.addJavascriptInterface(SplashInterface(), "Android")

        splashWebView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Start loading main content in background
                webView.loadUrl(APP_URL)
            }
        }
    }

    inner class SplashInterface {
        @JavascriptInterface
        fun onSplashComplete() {
            mainHandler.post {
                hideSplash()
            }
        }
    }
    
    // JavaScript interface for native features
    inner class NativeInterface {
        @JavascriptInterface
        fun getFCMToken(): String {
            // Return cached token first if available
            if (!cachedFCMToken.isNullOrEmpty()) {
                return cachedFCMToken!!
            }
            // Fallback to shared preferences
            val prefs = getSharedPreferences("dtps_prefs", Context.MODE_PRIVATE)
            return prefs.getString("fcm_token", "") ?: ""
        }
        
        @JavascriptInterface
        fun refreshFCMToken() {
            mainHandler.post {
                fetchFCMToken()
            }
        }
        
        @JavascriptInterface
        fun isNativeApp(): Boolean {
            return true
        }
        
        @JavascriptInterface
        fun getDeviceType(): String {
            return "android"
        }
        
        @JavascriptInterface
        fun requestNotificationPermission() {
            mainHandler.post {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) 
                        != PackageManager.PERMISSION_GRANTED) {
                        multiplePermissionsLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
                    }
                }
            }
        }
        
        @JavascriptInterface
        fun log(message: String) {
            Log.d(TAG, "WebView: $message")
        }
    }

    private fun showSplash() {
        splashWebView.visibility = View.VISIBLE
        webView.visibility = View.GONE
        splashWebView.loadUrl(SPLASH_URL)
    }

    private fun hideSplash() {
        if (!splashComplete) {
            splashComplete = true
            splashWebView.visibility = View.GONE
            webView.visibility = View.VISIBLE
            progressBar.visibility = View.GONE
        }
    }

    private fun requestAllPermissions() {
        val permissionsToRequest = mutableListOf<String>()

        // Check Camera permission
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) 
            != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.CAMERA)
        }

        // Check Microphone permission
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) 
            != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.RECORD_AUDIO)
        }

        // Check Notification permission (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) 
                != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        // Request all missing permissions at once
        if (permissionsToRequest.isNotEmpty()) {
            multiplePermissionsLauncher.launch(permissionsToRequest.toTypedArray())
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Suppress("DEPRECATION")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true  // Deprecated but still works
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = true
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            setSupportMultipleWindows(false)
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = true
            displayZoomControls = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            
            // Enable modern web features
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                safeBrowsingEnabled = true
            }
        }
        
        // Add JavaScript interface for native features (FCM token, etc.)
        webView.addJavascriptInterface(NativeInterface(), "NativeApp")

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                if (splashComplete) {
                    progressBar.visibility = View.VISIBLE
                }
                offlineView.visibility = View.GONE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true && splashComplete) {
                    showOfflineView()
                }
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                val host = Uri.parse(url).host ?: return false

                // Allow navigation within allowed hosts
                if (ALLOWED_HOSTS.any { host == it || host.endsWith(".$it") }) {
                    return false
                }

                // Allow payment and auth providers
                if (host.contains("razorpay.com") || 
                    host.contains("googleapis.com") ||
                    host.contains("firebaseapp.com")) {
                    return false
                }

                // Open external links in browser
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (splashComplete) {
                    progressBar.progress = newProgress
                }
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.let { permRequest ->
                    val resources = permRequest.resources
                    val permissions = mutableListOf<String>()

                    if (resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                        permissions.add(Manifest.permission.CAMERA)
                    }
                    if (resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        permissions.add(Manifest.permission.RECORD_AUDIO)
                    }

                    if (permissions.isEmpty()) {
                        permRequest.grant(resources)
                        return
                    }

                    val allGranted = permissions.all {
                        ContextCompat.checkSelfPermission(this@MainActivity, it) == 
                            PackageManager.PERMISSION_GRANTED
                    }

                    if (allGranted) {
                        permRequest.grant(resources)
                    } else {
                        permissionCallback = permRequest
                        requestPermissions(permissions.toTypedArray(), 100)
                    }
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback
                
                val acceptTypes = fileChooserParams?.acceptTypes ?: arrayOf("*/*")
                val isImageRequest = acceptTypes.any { 
                    it.contains("image") || it == "*/*" 
                }
                
                if (isImageRequest) {
                    // Show dialog with Camera and Gallery options
                    showImagePickerDialog()
                } else {
                    // For non-image files, use regular file picker
                    val mimeTypes = acceptTypes.joinToString(",").ifEmpty { "*/*" }
                    galleryPickerLauncher.launch(mimeTypes)
                }
                return true
            }
        }
    }
    
    private fun showImagePickerDialog() {
        val options = arrayOf("📷 Take Photo", "🖼️ Choose from Gallery", "Cancel")
        
        AlertDialog.Builder(this)
            .setTitle("Select Image")
            .setItems(options) { dialog, which ->
                when (which) {
                    0 -> openCamera()
                    1 -> openGallery()
                    else -> {
                        fileUploadCallback?.onReceiveValue(null)
                        fileUploadCallback = null
                    }
                }
                dialog.dismiss()
            }
            .setOnCancelListener {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = null
            }
            .show()
    }
    
    private fun openCamera() {
        // Check camera permission
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) 
            != PackageManager.PERMISSION_GRANTED) {
            // Request permission then try again
            multiplePermissionsLauncher.launch(arrayOf(Manifest.permission.CAMERA))
            fileUploadCallback?.onReceiveValue(null)
            fileUploadCallback = null
            return
        }
        
        try {
            val photoFile = createImageFile()
            cameraPhotoUri = FileProvider.getUriForFile(
                this,
                "${packageName}.fileprovider",
                photoFile
            )
            cameraPhotoUri?.let { uri ->
                cameraLauncher.launch(uri)
            } ?: run {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = null
            }
        } catch (e: Exception) {
            e.printStackTrace()
            fileUploadCallback?.onReceiveValue(null)
            fileUploadCallback = null
        }
    }
    
    private fun openGallery() {
        galleryPickerLauncher.launch("image/*")
    }
    
    private fun createImageFile(): File {
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val imageFileName = "DTPS_${timeStamp}_"
        val storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES)
        return File.createTempFile(imageFileName, ".jpg", storageDir)
    }

    private fun setupBackHandler() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    showExitDialog()
                }
            }
        })
    }

    private fun loadUrl() {
        offlineView.visibility = View.GONE
        webView.visibility = View.VISIBLE
        webView.loadUrl(APP_URL)
    }

    private fun showOfflineView() {
        progressBar.visibility = View.GONE
        offlineView.visibility = View.VISIBLE
    }

    private fun showExitDialog() {
        AlertDialog.Builder(this)
            .setTitle("Exit App")
            .setMessage("Are you sure you want to exit?")
            .setPositiveButton("Exit") { _, _ -> finish() }
            .setNegativeButton("Cancel", null)
            .show()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 100) {
            permissionCallback?.let { callback ->
                val allGranted = grantResults.all { it == PackageManager.PERMISSION_GRANTED }
                if (allGranted) {
                    callback.grant(callback.resources)
                } else {
                    callback.deny()
                }
                permissionCallback = null
            }
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        
        // Register for foreground notification broadcasts
        LocalBroadcastManager.getInstance(this).registerReceiver(
            foregroundNotificationReceiver,
            IntentFilter(DTPSFirebaseMessagingService.ACTION_FOREGROUND_NOTIFICATION)
        )
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        
        // Unregister foreground notification receiver
        try {
            LocalBroadcastManager.getInstance(this).unregisterReceiver(foregroundNotificationReceiver)
        } catch (e: Exception) {
            Log.e(TAG, "Error unregistering receiver", e)
        }
    }

    override fun onDestroy() {
        splashWebView.destroy()
        webView.destroy()
        super.onDestroy()
    }
}
