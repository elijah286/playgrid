import UIKit
import Capacitor

/// Subclass of Capacitor's bridge controller for iOS-specific WebView
/// configuration. Hooked into Main.storyboard so it owns the WKWebView from
/// app launch.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        configureBounce(label: "capacitorDidLoad")
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        // Re-apply on every appearance in case an intermediate iOS layout
        // pass resets the scrollView's bounce flags between launches.
        configureBounce(label: "viewWillAppear")
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        configureBounce(label: "viewDidAppear")
    }

    /// Enable WKWebView's *vertical* rubber-band overscroll at the
    /// UIScrollView layer.
    ///
    /// This used to be fully DISABLED (`bounces = false`) to stop a downward
    /// drag at the top of the page from pulling the sticky header below the
    /// status bar (the "white gap"). We now allow the vertical bounce again:
    ///
    ///   1. The top-of-page pull is intercepted by the JS pull-to-refresh
    ///      gesture (src/components/native/PullToRefresh.tsx), which calls
    ///      preventDefault on the touch and drives its own indicator — so the
    ///      native top bounce never fires there and the white gap can't
    ///      reappear on normal pages.
    ///   2. Coaches with a short playbook (a few plays that fit on screen)
    ///      need the standard "pull and it gives, release and it snaps back"
    ///      cue, or the list feels frozen. `alwaysBounceVertical = true` makes
    ///      the page rubber-band even when its content fits the viewport —
    ///      which CSS / a min-height hack cannot do, because (per WebKit) the
    ///      top-level bounce is owned by UIKit, not the web content. This is
    ///      why the earlier web-only attempts had no effect.
    ///
    /// Horizontal bounce and zoom bounce stay OFF: the app never scrolls
    /// sideways and pinch-zoom is disabled, so a sideways/zoom rubber-band
    /// would only ever be an accidental, off-axis gesture.
    ///
    /// NSLog output appears in `xcrun simctl spawn <udid> log stream` and the
    /// Xcode console attached to a physical device.
    private func configureBounce(label: String) {
        guard let scrollView = self.webView?.scrollView else {
            NSLog("[XOGrid] configureBounce(\(label)) SKIPPED — webView is nil")
            return
        }
        scrollView.bounces = true
        scrollView.alwaysBounceVertical = true
        scrollView.alwaysBounceHorizontal = false
        scrollView.bouncesZoom = false
        NSLog(
            "[XOGrid] configureBounce(\(label)) applied: bounces=\(scrollView.bounces) alwaysV=\(scrollView.alwaysBounceVertical)"
        )
    }
}
