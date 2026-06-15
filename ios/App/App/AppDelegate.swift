import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Push notifications (APNs)
    // Forward the APNs device token (and failures) to the Capacitor
    // PushNotifications plugin. Without these, PushNotifications.register()
    // triggers the OS prompt but the resulting token never reaches the JS
    // `registration` listener, so it's never persisted server-side. We send
    // to APNs directly (no Firebase iOS SDK), so the raw token is exactly
    // what the backend stores for the APNs send path.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
        // Cache the token (same lowercase-hex format the plugin sends to JS) so
        // the silent-push handler can report it later without a fresh register.
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(hex, forKey: "pushApnsToken")
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // MARK: - Silent-push token refresh
    // A `content-available` background push (sent by the server cron to stale
    // iOS tokens) wakes the app here even when it's been killed — the only way
    // a never-reopened install can refresh a rotated/at-risk token. We report
    // the cached APNs token to /api/push/refresh, authenticated by the
    // per-device secret the WebView stored via @capacitor/preferences. Requires
    // UIBackgroundModes "remote-notification" (see Info.plist).
    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        guard let token = UserDefaults.standard.string(forKey: "pushApnsToken"),
              let secret = pushRefreshSecret() else {
            completionHandler(.noData)
            return
        }
        postPushRefresh(secret: secret, token: token) { ok in
            completionHandler(ok ? .newData : .noData)
        }
    }

    /// Read the per-device refresh secret written by @capacitor/preferences.
    /// The plugin's exact iOS storage layout varies by version, so probe the
    /// common forms; confirm against the installed plugin during native testing.
    private func pushRefreshSecret() -> String? {
        let key = "pushRefreshSecret"
        if let v = UserDefaults(suiteName: "CapacitorStorage")?.string(forKey: key) { return v }
        if let v = UserDefaults.standard.string(forKey: key) { return v }
        if let v = UserDefaults.standard.string(forKey: "CapacitorStorage.\(key)") { return v }
        return nil
    }

    private func postPushRefresh(secret: String, token: String, done: @escaping (Bool) -> Void) {
        guard let url = URL(string: "https://www.xogridmaker.com/api/push/refresh") else { done(false); return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 15
        let body: [String: Any] = ["secret": secret, "token": token, "platform": "ios"]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req) { _, response, _ in
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            done(code >= 200 && code < 300)
        }.resume()
    }

}
