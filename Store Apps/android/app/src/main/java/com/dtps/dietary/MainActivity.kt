package com.dtps.dietary

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineView: View
    private lateinit var offlineText: TextView
    private lateinit var retryButton: View

    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var permissionCallback: PermissionRequest? = null

    companion object {
        private const val APP_URL = "https://dtps.tech/user"
        private val ALLOWED_HOSTS = listOf(
            "dtps.tech",
            "www.dtps.tech",
            "google.com",
            "gstatic.com",
            "recaptcha.net",
        )
    }

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        fileUploadCallback?.onReceiveValue(uris.toTypedArray())
        fileUploadCallback = null
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        // Notification permission handled
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        
        // Set up white status bar with dark icons
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = ContextCompat.getColor(this, android.R.color.white)
        window.navigationBarColor = ContextCompat.getColor(this, android.R.color.white)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }

        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        offlineView = findViewById(R.id.offlineView)
        offlineText = findViewById(R.id.offlineText)
        retryButton = findViewById(R.id.retryButton)

        setupWebView()
        setupBackHandler()
        
        retryButton.setOnClickListener {
            loadUrl()
        }

        loadUrl()
        requestNotificationPermission()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
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

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                progressBar.visibility = View.VISIBLE
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
                if (request?.isForMainFrame == true) {
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
                progressBar.progress = newProgress
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
                
                val mimeTypes = fileChooserParams?.acceptTypes?.joinToString(",") ?: "image/*"
                filePickerLauncher.launch(mimeTypes)
                return true
            }
        }
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

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
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
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
