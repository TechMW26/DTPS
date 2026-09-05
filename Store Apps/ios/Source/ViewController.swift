import UIKit
import WebKit
import UserNotifications

class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    
    private var webView: WKWebView!
    private var progressView: UIProgressView!
    private var offlineView: UIView!
    
    private let appURL = URL(string: "https://dtps.tech/user")!
    private let allowedHosts = [
        "dtps.tech", "www.dtps.tech",
        "razorpay.com",
        "google.com", "googleapis.com", "googleusercontent.com", "gstatic.com",
        "firebaseapp.com", "web.app", "recaptcha.net",
    ]

    private func isAllowedWebHost(_ host: String) -> Bool {
        let normalizedHost = host.lowercased()
        return allowedHosts.contains {
            normalizedHost == $0 || normalizedHost.hasSuffix(".\($0)")
        }
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        view.backgroundColor = .white
        
        setupWebView()
        setupProgressView()
        setupOfflineView()
        loadApp()
        requestNotificationPermission()
    }
    
    private func setupWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        
        // Enable camera and microphone
        if #available(iOS 14.0, *) {
            configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        }
        
        webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.bounces = true
        webView.backgroundColor = .white
        
        view.addSubview(webView)
        
        // Observe loading progress
        webView.addObserver(self, forKeyPath: "estimatedProgress", options: .new, context: nil)
    }
    
    private func setupProgressView() {
        progressView = UIProgressView(progressViewStyle: .bar)
        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.progressTintColor = UIColor(red: 22/255, green: 163/255, blue: 74/255, alpha: 1)
        progressView.isHidden = true
        
        view.addSubview(progressView)
        
        NSLayoutConstraint.activate([
            progressView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressView.heightAnchor.constraint(equalToConstant: 3)
        ])
    }
    
    private func setupOfflineView() {
        offlineView = UIView(frame: view.bounds)
        offlineView.backgroundColor = .white
        offlineView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        offlineView.isHidden = true
        
        let stackView = UIStackView()
        stackView.axis = .vertical
        stackView.alignment = .center
        stackView.spacing = 16
        stackView.translatesAutoresizingMaskIntoConstraints = false
        
        let iconLabel = UILabel()
        iconLabel.text = "📶"
        iconLabel.font = .systemFont(ofSize: 60)
        
        let titleLabel = UILabel()
        titleLabel.text = "No Internet Connection"
        titleLabel.font = .boldSystemFont(ofSize: 20)
        titleLabel.textColor = UIColor(red: 31/255, green: 41/255, blue: 55/255, alpha: 1)
        
        let messageLabel = UILabel()
        messageLabel.text = "Please check your internet connection and try again."
        messageLabel.font = .systemFont(ofSize: 16)
        messageLabel.textColor = UIColor(red: 107/255, green: 114/255, blue: 128/255, alpha: 1)
        messageLabel.textAlignment = .center
        messageLabel.numberOfLines = 0
        
        let retryButton = UIButton(type: .system)
        retryButton.setTitle("Retry", for: .normal)
        retryButton.titleLabel?.font = .boldSystemFont(ofSize: 16)
        retryButton.backgroundColor = UIColor(red: 22/255, green: 163/255, blue: 74/255, alpha: 1)
        retryButton.setTitleColor(.white, for: .normal)
        retryButton.layer.cornerRadius = 8
        retryButton.contentEdgeInsets = UIEdgeInsets(top: 12, left: 32, bottom: 12, right: 32)
        retryButton.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)
        
        stackView.addArrangedSubview(iconLabel)
        stackView.addArrangedSubview(titleLabel)
        stackView.addArrangedSubview(messageLabel)
        stackView.addArrangedSubview(retryButton)
        
        offlineView.addSubview(stackView)
        
        NSLayoutConstraint.activate([
            stackView.centerXAnchor.constraint(equalTo: offlineView.centerXAnchor),
            stackView.centerYAnchor.constraint(equalTo: offlineView.centerYAnchor),
            stackView.leadingAnchor.constraint(greaterThanOrEqualTo: offlineView.leadingAnchor, constant: 32),
            stackView.trailingAnchor.constraint(lessThanOrEqualTo: offlineView.trailingAnchor, constant: -32)
        ])
        
        view.addSubview(offlineView)
    }
    
    private func loadApp() {
        offlineView.isHidden = true
        let request = URLRequest(url: appURL)
        webView.load(request)
    }
    
    @objc private func retryTapped() {
        loadApp()
    }
    
    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            print("Notification permission granted: \(granted)")
        }
    }
    
    // MARK: - Progress Observer
    
    override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey : Any]?, context: UnsafeMutableRawPointer?) {
        if keyPath == "estimatedProgress" {
            progressView.progress = Float(webView.estimatedProgress)
            progressView.isHidden = webView.estimatedProgress >= 1.0
        }
    }
    
    // MARK: - WKNavigationDelegate
    
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        progressView.isHidden = false
        progressView.progress = 0
    }
    
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        progressView.isHidden = true
    }
    
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        progressView.isHidden = true
        showOfflineView()
    }
    
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        progressView.isHidden = true
        showOfflineView()
    }
    
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        // Provider-owned iframes must stay embedded. Sending a Firebase
        // reCAPTCHA subframe to Safari loses the in-page OTP callback.
        if navigationAction.targetFrame?.isMainFrame == false,
           url.scheme == "https" || url.scheme == "http" {
            decisionHandler(.allow)
            return
        }

        if url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
            decisionHandler(.allow)
            return
        }

        let host = url.host?.lowercased() ?? ""
        
        // Allow navigation within allowed hosts
        if isAllowedWebHost(host) {
            decisionHandler(.allow)
            return
        }

        // Open external links in Safari
        if url.scheme == "http" || url.scheme == "https" || UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }
    
    private func showOfflineView() {
        offlineView.isHidden = false
    }
    
    // MARK: - WKUIDelegate

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }
    
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler()
        })
        present(alert, animated: true)
    }
    
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
            completionHandler(false)
        })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(true)
        })
        present(alert, animated: true)
    }
    
    // MARK: - Status Bar
    
    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .darkContent
    }
    
    deinit {
        webView.removeObserver(self, forKeyPath: "estimatedProgress")
    }
}
