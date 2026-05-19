import UIKit
import Capacitor

/// Subclass of Capacitor's bridge controller for iOS-specific WebView
/// hardening. Hooked into Main.storyboard so it owns the WKWebView from
/// app launch.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        disableBouncing(label: "capacitorDidLoad")
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        // Re-apply on every appearance in case something inside the WebView
        // lifecycle resets the scrollView's bounce flags between launches.
        disableBouncing(label: "viewWillAppear")
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        disableBouncing(label: "viewDidAppear")
    }

    /// Disable WKWebView's rubber-band overscroll at the UIScrollView layer.
    ///
    /// CSS `overscroll-behavior: none` only applies to nested scroll
    /// containers in WebKit; the top-level bounce is owned by UIKit, so
    /// we have to reach in and set it on the underlying scrollView.
    /// Capacitor's CAPBridgeViewController.swift already sets
    /// `bounces = false` once in `prepareWebView`, but we set it again
    /// here defensively at multiple lifecycle points — there are reports
    /// of the flag being reset by intermediate iOS layout passes.
    ///
    /// NSLog output appears in `xcrun simctl spawn <udid> log stream`
    /// and the Xcode console attached to a physical device.
    private func disableBouncing(label: String) {
        guard let scrollView = self.webView?.scrollView else {
            NSLog("[XOGrid] disableBouncing(\(label)) SKIPPED — webView is nil")
            return
        }
        scrollView.bounces = false
        scrollView.alwaysBounceVertical = false
        scrollView.alwaysBounceHorizontal = false
        scrollView.bouncesZoom = false
        NSLog(
            "[XOGrid] disableBouncing(\(label)) applied: bounces=\(scrollView.bounces) alwaysV=\(scrollView.alwaysBounceVertical)"
        )
    }
}
