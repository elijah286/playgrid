import UIKit
import Capacitor

/// Subclass of Capacitor's bridge controller for iOS-specific WebView
/// hardening. Hooked into Main.storyboard so it owns the WKWebView from
/// app launch.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // Disable WKWebView's outer rubber-band overscroll. Without this,
        // a downward drag at the top of the page pulls the entire document
        // — sticky header included — below the status bar, exposing a
        // white gap.
        //
        // CSS `overscroll-behavior: none` (added in globals.css) only
        // applies to nested scroll containers in WebKit; the top-level
        // bounce is owned by UIScrollView at the UIKit layer. Setting
        // `bounces = false` here is the definitive cross-iOS-version fix.
        //
        // The app has no pull-to-refresh anywhere, so disabling bounce
        // entirely is loss-free.
        if let webView = self.bridge?.webView {
            webView.scrollView.bounces = false
            webView.scrollView.alwaysBounceVertical = false
            webView.scrollView.alwaysBounceHorizontal = false
        }
    }
}
