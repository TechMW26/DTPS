import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Create MainViewController immediately so the WebView starts loading right away
        let mainVC = MainViewController()

        // Create splash as an overlay on top
        let splashVC = SplashViewController()
        splashVC.onReadyToTransition = { [weak splashVC] in
            // Fade out splash overlay
            UIView.animate(withDuration: 0.3, animations: {
                splashVC?.view.alpha = 0
            }) { _ in
                splashVC?.view.removeFromSuperview()
                splashVC?.removeFromParent()
            }
        }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = mainVC
        window?.makeKeyAndVisible()

        // Add splash on top of mainVC
        mainVC.addChild(splashVC)
        splashVC.view.frame = mainVC.view.bounds
        splashVC.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        mainVC.view.addSubview(splashVC.view)
        splashVC.didMove(toParent: mainVC)

        // Start preloading the web page immediately
        mainVC.preloadWebView()

        // Handle URL contexts passed at launch
        if let urlContext = connectionOptions.urlContexts.first {
            handleURL(urlContext.url)
        }
        // Handle Universal Links passed at launch
        if let userActivity = connectionOptions.userActivities.first,
           userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let url = userActivity.webpageURL {
            handleURL(url)
        }
    }

    // MARK: - URL Handling

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        if let url = URLContexts.first?.url { handleURL(url) }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let url = userActivity.webpageURL {
            handleURL(url)
        }
    }

    private func handleURL(_ url: URL) {
        NotificationCenter.default.post(name: .deepLinkReceived, object: url)
    }

    // MARK: - Scene Lifecycle

    func sceneDidBecomeActive(_ scene: UIScene) {
        UIApplication.shared.applicationIconBadgeNumber = 0
    }

    func sceneDidDisconnect(_ scene: UIScene) {}
    func sceneWillResignActive(_ scene: UIScene) {}
    func sceneWillEnterForeground(_ scene: UIScene) {}
    func sceneDidEnterBackground(_ scene: UIScene) {}
}
