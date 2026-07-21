import UIKit
import WebKit
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    static var fcmToken: String?

    /// Shared process pool — all WKWebViews in the app reuse the same WebKit processes
    static let sharedProcessPool = WKProcessPool()

    /// Warm-up WebView kept alive until real WebView takes over
    private static var warmupWebView: WKWebView?

    // MARK: - App Lifecycle

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Pre-warm WebKit processes immediately (spins up Networking, GPU, WebContent processes)
        AppDelegate.prewarmWebKitProcesses()

        requestNotificationPermission(application: application)
        configureAppearance()
        return true
    }

    /// Spawns a throwaway WKWebView that loads about:blank to force WebKit
    /// to spin up its child processes. These stay alive for the app session
    /// and are reused by the real WebView via the shared process pool.
    static func prewarmWebKitProcesses() {
        let config = WKWebViewConfiguration()
        config.processPool = sharedProcessPool
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.load(URLRequest(url: URL(string: "about:blank")!))
        warmupWebView = wv // prevent dealloc until real WKWebView is ready
    }

    /// Called by MainViewController once its real WebView is configured
    static func releaseWarmupWebView() {
        warmupWebView = nil
    }

    // MARK: - Push Notifications

    private func requestNotificationPermission(application: UIApplication) {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if granted {
                DispatchQueue.main.async { application.registerForRemoteNotifications() }
            }
            if let error = error {
                print("[DTPS] Notification permission error: \(error.localizedDescription)")
            }
        }
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("[DTPS] APNs token: \(token)")
        AppDelegate.fcmToken = token
        UserDefaults.standard.set(token, forKey: "apns_token")
        NotificationCenter.default.post(name: .apnsTokenReceived, object: token)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[DTPS] Failed to register for remote notifications: \(error.localizedDescription)")
    }

    // MARK: - Appearance

    private func configureAppearance() {
        if #available(iOS 15.0, *) {
            let navAppearance = UINavigationBarAppearance()
            navAppearance.configureWithOpaqueBackground()
            navAppearance.backgroundColor = .white
            UINavigationBar.appearance().standardAppearance = navAppearance
            UINavigationBar.appearance().scrollEdgeAppearance = navAppearance
        }
    }

    // MARK: - Scene Configuration

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    func application(
        _ application: UIApplication,
        didDiscardSceneSessions sceneSessions: Set<UISceneSession>
    ) {}

    // MARK: - Deep Linking

    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        if url.scheme == "dtps" {
            NotificationCenter.default.post(name: .deepLinkReceived, object: url)
            return true
        }
        return false
    }

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let url = userActivity.webpageURL {
            NotificationCenter.default.post(name: .deepLinkReceived, object: url)
            return true
        }
        return false
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension AppDelegate: UNUserNotificationCenterDelegate {

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let userInfo = notification.request.content.userInfo
        print("[DTPS] Foreground notification: \(userInfo)")
        NotificationCenter.default.post(name: .foregroundNotificationReceived, object: userInfo)
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .sound, .badge])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        print("[DTPS] Notification tapped: \(userInfo)")
        let urlString = (userInfo["url"] as? String) ?? (userInfo["clickAction"] as? String)
        let baseURL = URL(string: "https://dtps.tech")!
        if let urlString,
           let url = URL(string: urlString, relativeTo: baseURL)?.absoluteURL,
           url.scheme == "https",
           url.host == "dtps.tech" || url.host?.hasSuffix(".dtps.tech") == true {
            NotificationCenter.default.post(name: .notificationTapped, object: url)
        }
        completionHandler()
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let apnsTokenReceived = Notification.Name("apnsTokenReceived")
    static let deepLinkReceived = Notification.Name("deepLinkReceived")
    static let foregroundNotificationReceived = Notification.Name("foregroundNotificationReceived")
    static let notificationTapped = Notification.Name("notificationTapped")
}
