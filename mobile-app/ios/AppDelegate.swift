import UIKit
import UserNotifications
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    
    var window: UIWindow?
    
    // FCM Token storage
    static var fcmToken: String?
    
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        // Request notification permissions
        requestNotificationPermission(application: application)
        
        // Configure appearance
        configureAppearance()
        
        return true
    }
    
    // MARK: - Push Notifications
    
    private func requestNotificationPermission(application: UIApplication) {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if granted {
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            }
            if let error = error {
                print("Notification permission error: \(error.localizedDescription)")
            }
        }
    }
    
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("APNs Device Token: \(token)")
        AppDelegate.fcmToken = token
        
        // Store in UserDefaults for WebView access
        UserDefaults.standard.set(token, forKey: "apns_token")
        
        // Notify WebView if it's ready
        NotificationCenter.default.post(name: .apnsTokenReceived, object: token)
    }
    
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Failed to register for remote notifications: \(error.localizedDescription)")
    }
    
    // MARK: - Appearance
    
    private func configureAppearance() {
        // White status bar background with dark text
        if #available(iOS 15.0, *) {
            let appearance = UINavigationBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = .white
            UINavigationBar.appearance().standardAppearance = appearance
            UINavigationBar.appearance().scrollEdgeAppearance = appearance
        }
    }
    
    // MARK: - UISceneSession Lifecycle
    
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }
    
    func application(_ application: UIApplication, didDiscardSceneSessions sceneSessions: Set<UISceneSession>) {
    }
    
    // MARK: - Deep Linking
    
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
        // Handle dtps:// URL scheme
        if url.scheme == "dtps" {
            handleDeepLink(url: url)
            return true
        }
        return false
    }
    
    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Handle Universal Links
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let url = userActivity.webpageURL {
            handleDeepLink(url: url)
            return true
        }
        return false
    }
    
    private func handleDeepLink(url: URL) {
        NotificationCenter.default.post(name: .deepLinkReceived, object: url)
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension AppDelegate: UNUserNotificationCenterDelegate {
    
    // Handle notification when app is in foreground
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let userInfo = notification.request.content.userInfo
        print("Foreground notification received: \(userInfo)")
        
        // Forward to WebView
        NotificationCenter.default.post(name: .foregroundNotificationReceived, object: userInfo)
        
        // Show notification banner
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .sound, .badge])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }
    
    // Handle notification tap
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        print("Notification tapped: \(userInfo)")
        
        // Navigate to appropriate screen
        if let urlString = userInfo["url"] as? String, let url = URL(string: urlString) {
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
