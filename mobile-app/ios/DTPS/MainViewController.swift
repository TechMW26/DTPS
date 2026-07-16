import UIKit
import WebKit
import AVFoundation
import Photos
import UserNotifications

class MainViewController: UIViewController {

    // MARK: - Properties

    private var webView: WKWebView!
    private var progressView: UIProgressView!
    private var offlineView: UIView!
    private var retryButton: UIButton!
    private var loadingView: UIView!
    private var loadingSpinner: UIActivityIndicatorView!

    private let appURL = "https://dtps.tech/user"
    private let allowedHosts = [
        "dtps.tech",
        // Razorpay payment gateway
        "razorpay.com", "api.razorpay.com", "checkout.razorpay.com",
        // UPI & bank redirect hosts used by Razorpay
        "paytm.com", "phonepe.com", "gpay.com",
    ]

    private var progressObservation: NSKeyValueObservation?
    private var pendingDeepLink: URL?
    private var fileUploadCompletionHandler: (([URL]?) -> Void)?
    private var hasStartedLoading = false
    private var hasFinishedFirstLoad = false
    private var loadTimeoutTimer: Timer?
    /// Maximum time (seconds) to wait for the initial page load before showing error UI
    private let loadTimeoutSeconds: TimeInterval = 30

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white

        setupWebView()
        setupProgressView()
        setupLoadingView()
        setupOfflineView()
        setupNotificationObservers()
        loadAppURL()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        navigationController?.setNavigationBarHidden(true, animated: animated)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }

    deinit {
        progressObservation?.invalidate()
        loadTimeoutTimer?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - WebView Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()

        // Reuse the pre-warmed process pool so WebKit doesn't cold-start new processes
        config.processPool = AppDelegate.sharedProcessPool

        // JavaScript
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        // Media
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // JS → Native bridge
        let uc = WKUserContentController()
        uc.add(self, name: "nativeInterface")
        uc.add(self, name: "fileUpload")
        config.userContentController = uc

        // Storage
        config.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.clipsToBounds = false
        webView.allowsBackForwardNavigationGestures = true
        webView.backgroundColor = .white
        webView.isOpaque = true
        webView.scrollView.bounces = true
        webView.scrollView.alwaysBounceVertical = true

        // Identify as native iOS
        webView.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 DTPSApp/iOS"

        // Progress tracking
        progressObservation = webView.observe(\.estimatedProgress, options: .new) { [weak self] wv, _ in
            self?.progressView.progress = Float(wv.estimatedProgress)
            self?.progressView.isHidden = wv.estimatedProgress >= 1.0
        }

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        // Release the warm-up WebView now that the real one shares the process pool
        AppDelegate.releaseWarmupWebView()
    }

    // MARK: - Progress Bar

    private func setupProgressView() {
        progressView = UIProgressView(progressViewStyle: .bar)
        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.progressTintColor = UIColor(red: 97/255, green: 160/255, blue: 53/255, alpha: 1)
        progressView.trackTintColor = .clear
        view.addSubview(progressView)
        NSLayoutConstraint.activate([
            progressView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressView.heightAnchor.constraint(equalToConstant: 3)
        ])
    }

    // MARK: - Loading View (shown while WebView loads content)

    private func setupLoadingView() {
        loadingView = UIView()
        loadingView.translatesAutoresizingMaskIntoConstraints = false
        loadingView.backgroundColor = .white

        loadingSpinner = UIActivityIndicatorView(style: .large)
        loadingSpinner.translatesAutoresizingMaskIntoConstraints = false
        loadingSpinner.color = UIColor(red: 59/255, green: 167/255, blue: 150/255, alpha: 1)
        loadingSpinner.startAnimating()

        let loadingLabel = UILabel()
        loadingLabel.translatesAutoresizingMaskIntoConstraints = false
        loadingLabel.text = "Loading DTPS..."
        loadingLabel.font = .systemFont(ofSize: 15, weight: .medium)
        loadingLabel.textColor = .gray
        loadingLabel.textAlignment = .center

        let stack = UIStackView(arrangedSubviews: [loadingSpinner, loadingLabel])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.spacing = 16
        stack.alignment = .center

        loadingView.addSubview(stack)
        view.addSubview(loadingView)

        NSLayoutConstraint.activate([
            loadingView.topAnchor.constraint(equalTo: view.topAnchor),
            loadingView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            loadingView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            loadingView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.centerXAnchor.constraint(equalTo: loadingView.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: loadingView.centerYAnchor),
        ])
    }

    // MARK: - Offline / Error View

    private func setupOfflineView() {
        offlineView = UIView()
        offlineView.translatesAutoresizingMaskIntoConstraints = false
        offlineView.backgroundColor = .white
        offlineView.isHidden = true

        let stack = UIStackView()
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.spacing = 16
        stack.alignment = .center

        let icon = UIImageView(image: UIImage(systemName: "wifi.slash"))
        icon.tintColor = .gray
        icon.contentMode = .scaleAspectFit
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.widthAnchor.constraint(equalToConstant: 60).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 60).isActive = true

        let title = UILabel()
        title.text = "Unable to Connect"
        title.font = .systemFont(ofSize: 18, weight: .semibold)
        title.textColor = .black
        title.tag = 1001 // tag for updating text dynamically

        let subtitle = UILabel()
        subtitle.text = "Please check your connection and try again."
        subtitle.font = .systemFont(ofSize: 14)
        subtitle.textColor = .gray
        subtitle.textAlignment = .center
        subtitle.numberOfLines = 0
        subtitle.tag = 1002 // tag for updating text dynamically

        retryButton = UIButton(type: .system)
        retryButton.setTitle("Retry", for: .normal)
        retryButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        retryButton.backgroundColor = UIColor(red: 59/255, green: 167/255, blue: 150/255, alpha: 1)
        retryButton.setTitleColor(.white, for: .normal)
        retryButton.layer.cornerRadius = 8
        var btnConfig = UIButton.Configuration.filled()
        btnConfig.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 32, bottom: 12, trailing: 32)
        btnConfig.baseBackgroundColor = UIColor(red: 59/255, green: 167/255, blue: 150/255, alpha: 1)
        retryButton.configuration = btnConfig
        retryButton.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)

        stack.addArrangedSubview(icon)
        stack.addArrangedSubview(title)
        stack.addArrangedSubview(subtitle)
        stack.addArrangedSubview(retryButton)

        offlineView.addSubview(stack)
        view.addSubview(offlineView)

        NSLayoutConstraint.activate([
            offlineView.topAnchor.constraint(equalTo: view.topAnchor),
            offlineView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            offlineView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            offlineView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.centerXAnchor.constraint(equalTo: offlineView.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: offlineView.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: offlineView.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: offlineView.trailingAnchor, constant: -32)
        ])
    }

    /// Show the error view with a specific message
    private func showErrorView(title: String = "Unable to Connect", subtitle: String = "Please check your connection and try again.", icon: String = "wifi.slash") {
        if let titleLabel = offlineView.viewWithTag(1001) as? UILabel {
            titleLabel.text = title
        }
        if let subtitleLabel = offlineView.viewWithTag(1002) as? UILabel {
            subtitleLabel.text = subtitle
        }
        // Find the icon image view (first UIImageView in the stack)
        if let stack = offlineView.subviews.first(where: { $0 is UIStackView }) as? UIStackView,
           let iconView = stack.arrangedSubviews.first(where: { $0 is UIImageView }) as? UIImageView {
            iconView.image = UIImage(systemName: icon)
        }
        loadingView.isHidden = true
        offlineView.isHidden = false
    }

    // MARK: - Notification Observers

    private func setupNotificationObservers() {
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(handleDeepLink(_:)),              name: .deepLinkReceived, object: nil)
        nc.addObserver(self, selector: #selector(handleAPNSToken(_:)),             name: .apnsTokenReceived, object: nil)
        nc.addObserver(self, selector: #selector(handleForegroundNotification(_:)), name: .foregroundNotificationReceived, object: nil)
        nc.addObserver(self, selector: #selector(handleNotificationTap(_:)),       name: .notificationTapped, object: nil)
    }

    // MARK: - Loading

    /// Called by SceneDelegate to start loading the page immediately (while splash is showing)
    func preloadWebView() {
        if !isViewLoaded { loadViewIfNeeded() }
        loadAppURL()
    }

    private func loadAppURL() {
        guard let url = URL(string: appURL) else { return }

        // Cancel any existing timeout timer
        loadTimeoutTimer?.invalidate()

        // Reset state for fresh load attempt
        hasStartedLoading = true
        hasFinishedFirstLoad = false

        // Show the loading indicator (behind splash initially, visible after splash fades)
        loadingView.isHidden = false
        offlineView.isHidden = true

        // Start loading
        webView.load(URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 30))

        // Start a timeout timer — if page doesn't finish in time, show error UI
        loadTimeoutTimer = Timer.scheduledTimer(withTimeInterval: loadTimeoutSeconds, repeats: false) { [weak self] _ in
            guard let self = self, !self.hasFinishedFirstLoad else { return }
            print("[DTPS] Load timeout after \(self.loadTimeoutSeconds)s — showing error")
            self.webView.stopLoading()
            self.showErrorView(
                title: "Taking Too Long",
                subtitle: "The page is taking too long to load. Please check your internet connection and try again.",
                icon: "clock.arrow.circlepath"
            )
        }
    }

    @objc private func retryTapped() {
        offlineView.isHidden = true
        loadAppURL()
    }

    // MARK: - Deep Linking

    @objc private func handleDeepLink(_ note: Notification) {
        guard let url = note.object as? URL else { return }
        if webView != nil {
            var str = url.absoluteString
            if url.scheme == "dtps" { str = "https://dtps.tech" + url.path }
            if let webURL = URL(string: str) { webView.load(URLRequest(url: webURL)) }
        } else {
            pendingDeepLink = url
        }
    }

    // MARK: - Push Token Injection

    @objc private func handleAPNSToken(_ note: Notification) {
        guard let token = note.object as? String else { return }
        let js = "window.dispatchEvent(new CustomEvent('fcmTokenReady',{detail:{token:'\(token)'}}));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    @objc private func handleForegroundNotification(_ note: Notification) {
        guard let userInfo = note.object as? [AnyHashable: Any],
              let data = try? JSONSerialization.data(withJSONObject: userInfo),
              let json = String(data: data, encoding: .utf8) else { return }
        let escaped = json.replacingOccurrences(of: "'", with: "\\'")
        let js = """
        (function(){try{var n=JSON.parse('\(escaped)');
        if(typeof window.onForegroundNotification==='function') window.onForegroundNotification(n);
        window.dispatchEvent(new CustomEvent('nativeForegroundNotification',{detail:n}));
        }catch(e){console.error('[DTPS] fg notification error',e);}})();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    @objc private func handleNotificationTap(_ note: Notification) {
        guard let url = note.object as? URL else { return }
        webView.load(URLRequest(url: url))
    }

    func handleBackPress() -> Bool {
        if webView.canGoBack { webView.goBack(); return true }
        return false
    }
}

// MARK: - WKNavigationDelegate

extension MainViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        // Page started receiving data — hide the offline view but keep loading view
        // until didFinish fires
        offlineView.isHidden = true
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Page fully loaded — cancel timeout, hide all overlays
        loadTimeoutTimer?.invalidate()
        hasFinishedFirstLoad = true
        offlineView.isHidden = true
        loadingView.isHidden = true

        injectNativeCSS()

        // If the user was redirected to the staff signin page (no session),
        // redirect them to the client signin page instead.
        if let currentURL = webView.url,
           let host = currentURL.host?.lowercased(),
           host.contains("dtps.tech"),
           currentURL.path.hasPrefix("/auth/signin") {
            if let clientSignIn = URL(string: "https://dtps.tech/client-auth/signin") {
                webView.load(URLRequest(url: clientSignIn))
                return
            }
        }

        // Signal splash overlay that the page is ready
        NotificationCenter.default.post(name: NSNotification.Name("DTPSWebPageLoaded"), object: nil)

        // Send push token if available
        if let token = UserDefaults.standard.string(forKey: "apns_token") {
            let js = "window.dispatchEvent(new CustomEvent('fcmTokenReady',{detail:{token:'\(token)'}}));"
            webView.evaluateJavaScript(js, completionHandler: nil)
        }

        // Handle pending deep link
        if let dl = pendingDeepLink {
            pendingDeepLink = nil
            handleDeepLink(Notification(name: .deepLinkReceived, object: dl))
        }
    }

    /// Inject CSS that handles safe-area spacing for native iOS wrapper
    private func injectNativeCSS() {
        let safeBottom = view.safeAreaInsets.bottom
        let js = """
        window.isNativeApp = true;
        window.deviceType = 'ios';

        // Ensure viewport is set for mobile with safe area coverage
        (function() {
            var vp = document.querySelector('meta[name=viewport]');
            if (!vp) { vp = document.createElement('meta'); vp.name = 'viewport'; document.head.appendChild(vp); }
            vp.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
        })();

        // Remove old injected styles and add fresh ones
        var old = document.getElementById('dtps-native-app-styles');
        if (old) old.remove();

        var s = document.createElement('style');
        s.id = 'dtps-native-app-styles';
        s.textContent = `
            /* ======= DTPS Native iOS — Safe Area & Spacing ======= */

            /* ===== Bottom Navigation Safe Area ===== */
            nav[class*="fixed"][class*="bottom-0"],
            div[class*="fixed"][class*="bottom-0"][class*="z-30"],
            .fixed.bottom-0.left-0.right-0.z-30,
            .fixed.bottom-0,
            [class*="fixed"][class*="bottom-0"][class*="left-0"][class*="right-0"] {
                padding-bottom: max(env(safe-area-inset-bottom, \(safeBottom)px), \(safeBottom)px) !important;
            }

            /* Inner pb-safe wrapper — full width */
            [class*="fixed"][class*="bottom-0"] .pb-safe {
                max-width: 100% !important;
                width: 100% !important;
            }

            /* Flex row with tab items — evenly distribute across full width */
            [class*="fixed"][class*="bottom-0"] .flex.items-center.justify-between,
            [class*="fixed"][class*="bottom-0"] .flex.items-center {
                justify-content: space-around !important;
                width: 100% !important;
                gap: 0 !important;
            }

            /* Each tab link — equal width */
            [class*="fixed"][class*="bottom-0"] .flex.items-center > a,
            [class*="fixed"][class*="bottom-0"] .flex.items-center > button,
            [class*="fixed"][class*="bottom-0"] a.flex.items-center.justify-center {
                flex: 1 1 0% !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                min-width: 0 !important;
                padding: 8px 0 !important;
            }

            /* Also handle grid-based bottom nav (ClientBottomNav variant) */
            [class*="fixed"][class*="bottom-0"] .grid {
                display: grid !important;
                grid-template-columns: repeat(5, 1fr) !important;
                width: 100% !important;
            }

            /* Prevent horizontal overflow */
            html, body {
                overflow-x: hidden !important;
                max-width: 100vw !important;
                -webkit-text-size-adjust: 100% !important;
            }

            /* Ensure content area doesn't hide behind bottom nav + safe area */
            main, [role="main"] {
                padding-bottom: calc(5rem + max(env(safe-area-inset-bottom, \(safeBottom)px), \(safeBottom)px)) !important;
            }

            /* Background fill behind bottom nav so home indicator area isn't transparent */
            body::after {
                content: '';
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                height: max(env(safe-area-inset-bottom, \(safeBottom)px), \(safeBottom)px);
                background: #ffffff;
                z-index: 29;
                pointer-events: none;
            }
        `;
        document.head.appendChild(s);

        // Signal native app mode
        if (typeof window.setNativeAppMode === 'function') window.setNativeAppMode(true);
        window.dispatchEvent(new CustomEvent('nativeAppReady', { detail: { platform: 'ios' } }));
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error)
    }

    private func handleLoadError(_ error: Error) {
        loadTimeoutTimer?.invalidate()
        let nsError = error as NSError

        // Ignore cancellations (e.g., user tapped a link before page finished, or frame cancelled)
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }

        print("[DTPS] Load error (\(nsError.code)): \(error.localizedDescription)")

        switch nsError.code {
        case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost:
            showErrorView(
                title: "No Internet Connection",
                subtitle: "Please check your Wi-Fi or cellular data and try again.",
                icon: "wifi.slash"
            )
        case NSURLErrorTimedOut:
            showErrorView(
                title: "Connection Timed Out",
                subtitle: "The server took too long to respond. Please try again.",
                icon: "clock.arrow.circlepath"
            )
        case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
            showErrorView(
                title: "Server Not Found",
                subtitle: "Could not reach the server. Please check your connection and try again.",
                icon: "exclamationmark.icloud"
            )
        case NSURLErrorSecureConnectionFailed, NSURLErrorServerCertificateUntrusted,
             NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateNotYetValid,
             NSURLErrorServerCertificateHasUnknownRoot:
            showErrorView(
                title: "Secure Connection Failed",
                subtitle: "Could not establish a secure connection to the server.",
                icon: "lock.slash"
            )
        default:
            showErrorView(
                title: "Something Went Wrong",
                subtitle: "An unexpected error occurred. Please try again.",
                icon: "exclamationmark.triangle"
            )
        }
    }

    /// Handle HTTP errors (e.g. 5xx server errors) via a navigation response policy check
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if let httpResponse = navigationResponse.response as? HTTPURLResponse {
            // If the server returns a 5xx error on the initial load, show error UI
            if httpResponse.statusCode >= 500 && !hasFinishedFirstLoad {
                print("[DTPS] Server error \(httpResponse.statusCode) during initial load")
                decisionHandler(.cancel)
                showErrorView(
                    title: "Server Error",
                    subtitle: "The server is temporarily unavailable. Please try again in a moment.",
                    icon: "exclamationmark.icloud"
                )
                return
            }
        }
        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else { decisionHandler(.allow); return }

        let host = url.host?.lowercased() ?? ""

        // Allow internal + payment gateway navigation
        if allowedHosts.contains(where: { host.contains($0) }) { decisionHandler(.allow); return }

        // Allow blob / data
        if url.scheme == "blob" || url.scheme == "data" { decisionHandler(.allow); return }

        // External http(s) → Safari
        if url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel); return
        }

        // tel:, mailto:, etc.
        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel); return
        }

        decisionHandler(.allow)
    }
}

// MARK: - WKUIDelegate

extension MainViewController: WKUIDelegate {

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    // Handle <input type="file"> — critical for profile picture, meal photos, etc.
    @available(iOS 18.4, *)
    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        presentMediaPicker(allowsMultipleSelection: parameters.allowsMultipleSelection, completionHandler: completionHandler)
    }
}

// MARK: - JS → Native Bridge

extension MainViewController: WKScriptMessageHandler {

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "fileUpload" { handleFileUploadRequest(message); return }

        guard message.name == "nativeInterface",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "getFCMToken":
            let token = UserDefaults.standard.string(forKey: "apns_token") ?? ""
            if let cb = body["callback"] as? String, !cb.isEmpty {
                webView.evaluateJavaScript("\(cb)('\(token)')", completionHandler: nil)
            }
        case "isNativeApp":
            if let cb = body["callback"] as? String, !cb.isEmpty {
                webView.evaluateJavaScript("\(cb)(true)", completionHandler: nil)
            }
        case "getDeviceType":
            if let cb = body["callback"] as? String, !cb.isEmpty {
                webView.evaluateJavaScript("\(cb)('ios')", completionHandler: nil)
            }
        case "log":
            if let msg = body["message"] as? String { print("[WebView] \(msg)") }
        case "requestNotificationPermission":
            requestNotificationPermission()
        case "openCamera":
            presentCamera()
        case "openGallery":
            presentPhotoPicker()
        default:
            print("[DTPS] Unknown native action: \(action)")
        }
    }

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            if granted { DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() } }
        }
    }

    private func handleFileUploadRequest(_ message: WKScriptMessage) {
        presentMediaPicker(allowsMultipleSelection: false) { [weak self] urls in
            guard let self = self, let urls = urls, let firstURL = urls.first,
                  let data = try? Data(contentsOf: firstURL) else { return }

            let b64 = data.base64EncodedString()
            let mime = "image/jpeg"
            let name = firstURL.lastPathComponent
            let js = """
            (function(){if(window._pendingFileInput){
            fetch('data:\(mime);base64,\(b64)').then(r=>r.blob()).then(b=>{
            var f=new File([b],'\(name)',{type:'\(mime)'});
            var dt=new DataTransfer();dt.items.add(f);
            window._pendingFileInput.files=dt.files;
            window._pendingFileInput.dispatchEvent(new Event('change',{bubbles:true}));
            window._pendingFileInput=null;});}})();
            """
            self.webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}

// MARK: - Media Picker (Camera / Photo Library)

extension MainViewController: UIImagePickerControllerDelegate, UINavigationControllerDelegate {

    private func presentMediaPicker(allowsMultipleSelection: Bool, completionHandler: @escaping ([URL]?) -> Void) {
        let sheet = UIAlertController(title: "Select Photo", message: nil, preferredStyle: .actionSheet)

        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            sheet.addAction(UIAlertAction(title: "Take Photo", style: .default) { [weak self] _ in
                self?.presentImagePicker(sourceType: .camera, completionHandler: completionHandler)
            })
        }
        sheet.addAction(UIAlertAction(title: "Choose from Library", style: .default) { [weak self] _ in
            self?.presentImagePicker(sourceType: .photoLibrary, completionHandler: completionHandler)
        })
        sheet.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })

        if let pop = sheet.popoverPresentationController {
            pop.sourceView = view
            pop.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
            pop.permittedArrowDirections = []
        }
        present(sheet, animated: true)
    }

    private func presentImagePicker(sourceType: UIImagePickerController.SourceType, completionHandler: @escaping ([URL]?) -> Void) {
        fileUploadCompletionHandler = completionHandler
        if sourceType == .camera {
            checkCameraPermission { [weak self] ok in if ok { self?.showPicker(.camera) } else { completionHandler(nil) } }
        } else {
            checkPhotoPermission { [weak self] ok in if ok { self?.showPicker(.photoLibrary) } else { completionHandler(nil) } }
        }
    }

    private func showPicker(_ source: UIImagePickerController.SourceType) {
        DispatchQueue.main.async {
            let p = UIImagePickerController()
            p.delegate = self
            p.sourceType = source
            p.mediaTypes = ["public.image"]
            self.present(p, animated: true)
        }
    }

    private func presentCamera() { presentImagePicker(sourceType: .camera) { _ in } }
    private func presentPhotoPicker() { presentImagePicker(sourceType: .photoLibrary) { _ in } }

    // Permission checks

    private func checkCameraPermission(completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { ok in DispatchQueue.main.async { completion(ok) } }
        default:
            completion(false)
            showPermissionAlert(title: "Camera Access", message: "Please enable camera access in Settings to take photos.")
        }
    }

    private func checkPhotoPermission(completion: @escaping (Bool) -> Void) {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        switch status {
        case .authorized, .limited: completion(true)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { s in
                DispatchQueue.main.async { completion(s == .authorized || s == .limited) }
            }
        default:
            completion(false)
            showPermissionAlert(title: "Photo Library Access", message: "Please enable photo library access in Settings to select photos.")
        }
    }

    private func showPermissionAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        alert.addAction(UIAlertAction(title: "Settings", style: .default) { _ in
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        })
        present(alert, animated: true)
    }

    // Delegate callbacks

    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        picker.dismiss(animated: true)
        if let url = info[.imageURL] as? URL {
            fileUploadCompletionHandler?([url])
        } else if let image = info[.originalImage] as? UIImage, let tmp = saveToTemp(image) {
            fileUploadCompletionHandler?([tmp])
        } else {
            fileUploadCompletionHandler?(nil)
        }
        fileUploadCompletionHandler = nil
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
        fileUploadCompletionHandler?(nil)
        fileUploadCompletionHandler = nil
    }

    private func saveToTemp(_ image: UIImage) -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("photo_\(Date().timeIntervalSince1970).jpg")
        guard let data = image.jpegData(compressionQuality: 0.8) else { return nil }
        do { try data.write(to: url); return url } catch { print("[DTPS] save error: \(error)"); return nil }
    }
}

