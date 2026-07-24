import UIKit
import WebKit
import Capacitor

/// Subclass of Capacitor's bridge controller for iOS-specific WebView
/// configuration. Hooked into Main.storyboard so it owns the WKWebView from
/// app launch.
///
/// Two concerns live here:
///   1. Vertical rubber-band overscroll tuning (`configureBounce`).
///   2. Cold-launch recovery: a watchdog + native retry overlay that rescues
///      the coach from an intermittent black screen when the remote site
///      stalls on launch (see the recovery section below).
class MainViewController: CAPBridgeViewController {

    // MARK: - Cold-launch recovery (watchdog + retry overlay)
    //
    // The WebView points at the remote site (`server.url`), so a cold launch
    // shows nothing until that document loads. Capacitor already handles two
    // failure modes itself: a *terminated* web-content process (it calls
    // `webView.reload()`), and a hard *navigation failure* (it loads
    // `server.errorPath` if set). Neither fires for a load that silently
    // *stalls* — captive portal, flaky LTE, a slow cold connect — so the coach
    // is left on a black WebView. That's the intermittent "black screen on
    // first launch."
    //
    // We arm a watchdog at launch. If the first page hasn't finished loading
    // within `watchdogTimeout`, we show a branded UIKit retry overlay (always
    // paints, even when the WebView can't). A late success auto-hides it.
    //
    // IMPORTANT: this never replaces `webView.navigationDelegate`. Capacitor's
    // WebViewDelegationHandler must stay the delegate, or App-Bound-Domains,
    // native sign-in, and plugin messaging break. We observe load state with
    // KVO on `estimatedProgress`, which is side-effect-free.

    /// How long the first load may take before the retry overlay appears. The
    /// warm backend answers in <3s; a cold cellular connect can take several,
    /// so this is generous enough not to interrupt a load that's about to
    /// succeed (and a late success auto-hides the overlay anyway).
    private let watchdogTimeout: TimeInterval = 10

    private var watchdog: Timer?
    private var progressObservation: NSKeyValueObservation?
    private var hasLoaded = false
    private var retryOverlay: RetryOverlayView?

    override func viewDidLoad() {
        super.viewDidLoad()
        observeLoadProgress()
        armWatchdog()
    }

    deinit {
        watchdog?.invalidate()
        progressObservation?.invalidate()
    }

    private func observeLoadProgress() {
        progressObservation = webView?.observe(
            \.estimatedProgress, options: [.new]
        ) { [weak self] webView, _ in
            if webView.estimatedProgress >= 0.99 {
                self?.handleLoadSucceeded()
            }
        }
        // Guard the race where the document finished before the observer was
        // attached (a fast warm load): KVO only fires on future changes.
        if isLoaded(webView) { handleLoadSucceeded() }
    }

    private func isLoaded(_ webView: WKWebView?) -> Bool {
        guard let webView else { return false }
        return webView.estimatedProgress >= 0.99 && !webView.isLoading
    }

    private func handleLoadSucceeded() {
        guard !hasLoaded else { return }
        hasLoaded = true
        watchdog?.invalidate()
        watchdog = nil
        hideRetryOverlay()
    }

    private func armWatchdog() {
        watchdog?.invalidate()
        watchdog = Timer.scheduledTimer(
            withTimeInterval: watchdogTimeout, repeats: false
        ) { [weak self] _ in
            guard let self, !self.hasLoaded else { return }
            // Re-verify before surfacing the overlay, in case the KVO change
            // was missed.
            if self.isLoaded(self.webView) {
                self.handleLoadSucceeded()
                return
            }
            self.showRetryOverlay()
        }
    }

    private func showRetryOverlay() {
        guard retryOverlay == nil, isViewLoaded else { return }
        let overlay = RetryOverlayView { [weak self] in self?.retry() }
        overlay.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(overlay)
        NSLayoutConstraint.activate([
            overlay.topAnchor.constraint(equalTo: view.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        retryOverlay = overlay
        NSLog("[XOGrid] cold-launch watchdog fired — showing retry overlay")
    }

    private func hideRetryOverlay() {
        guard let overlay = retryOverlay else { return }
        retryOverlay = nil
        UIView.animate(withDuration: 0.25, animations: {
            overlay.alpha = 0
        }, completion: { _ in
            overlay.removeFromSuperview()
        })
    }

    private func retry() {
        hideRetryOverlay()
        hasLoaded = false
        if let webView, webView.url != nil {
            // reloadFromOrigin bypasses the cache so a half-cached state can't
            // re-stall the same way.
            webView.reloadFromOrigin()
        } else {
            // The very first load never started — reload the configured start URL.
            webView?.reload()
        }
        armWatchdog()
    }

    // MARK: - Capacitor lifecycle

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

    // MARK: - Overscroll bounce

    /// Disable WKWebView's rubber-band overscroll at the UIScrollView layer,
    /// in every direction.
    ///
    /// The top-level page bounce is owned by UIKit, NOT the web content — so
    /// CSS (`overscroll-behavior`, min-height hacks) cannot control it; only
    /// these scrollView flags can. That's why the web-only attempts had no
    /// effect. We turn it fully OFF:
    ///
    ///   - A downward drag at the TOP no longer pulls the sticky colored
    ///     header below the status bar (the "white gap").
    ///   - An upward drag at the BOTTOM no longer exposes dead space beneath
    ///     the content.
    ///
    /// The page still scrolls normally for long content — `bounces` only
    /// governs the rubber-band at the edges — it simply stops hard at each
    /// edge now. Pull-to-refresh (src/components/native/PullToRefresh.tsx) is
    /// unaffected: it's a JS touch-delta gesture that preventDefaults and
    /// drives its own indicator, independent of the native bounce.
    ///
    /// (This restores the original `bounces = false` behavior; the interim
    /// "allow a short-list bounce cue" experiment made the app feel unglued
    /// from its chrome and is reverted.)
    ///
    /// NSLog output appears in `xcrun simctl spawn <udid> log stream` and the
    /// Xcode console attached to a physical device.
    private func configureBounce(label: String) {
        guard let scrollView = self.webView?.scrollView else {
            NSLog("[XOGrid] configureBounce(\(label)) SKIPPED — webView is nil")
            return
        }
        scrollView.bounces = false
        scrollView.alwaysBounceVertical = false
        scrollView.alwaysBounceHorizontal = false
        scrollView.bouncesZoom = false
        NSLog(
            "[XOGrid] configureBounce(\(label)) applied: bounces=\(scrollView.bounces) alwaysV=\(scrollView.alwaysBounceVertical)"
        )
    }
}

/// Native, dependency-free cold-launch recovery screen. Built in UIKit so it
/// always paints, even when the WebView can't. Theme-aware via system colors.
final class RetryOverlayView: UIView {

    private let onRetry: () -> Void

    init(onRetry: @escaping () -> Void) {
        self.onRetry = onRetry
        super.init(frame: .zero)
        backgroundColor = .systemBackground
        setUp()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setUp() {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false

        // Draw the brand monogram as a vector instead of reusing the launch
        // image. The launch artboard centers a small mark on a full-screen
        // canvas, so scaling it into a logo-sized box renders the mark tiny
        // (only ~8% of the frame is the mark). The vector fills its frame and
        // stays crisp, with zero bundled-asset dependency.
        let logo = MonogramView()
        logo.translatesAutoresizingMaskIntoConstraints = false
        logo.heightAnchor.constraint(equalToConstant: 64).isActive = true
        logo.widthAnchor.constraint(equalToConstant: 152).isActive = true
        stack.addArrangedSubview(logo)
        stack.setCustomSpacing(24, after: logo)

        let title = UILabel()
        title.text = "Can’t reach xogridmaker"
        title.font = .systemFont(ofSize: 18, weight: .bold)
        title.textColor = .label
        title.textAlignment = .center
        title.numberOfLines = 0
        stack.addArrangedSubview(title)

        let subtitle = UILabel()
        subtitle.text = "You appear to be offline or on a weak connection. Any playbooks you’ve already downloaded stay available offline — you can keep coaching from them."
        subtitle.font = .systemFont(ofSize: 15)
        subtitle.textColor = .secondaryLabel
        subtitle.numberOfLines = 0
        subtitle.textAlignment = .center
        stack.addArrangedSubview(subtitle)
        stack.setCustomSpacing(28, after: subtitle)

        var config = UIButton.Configuration.filled()
        config.title = "Try again"
        config.baseBackgroundColor = UIColor(red: 242.0 / 255.0, green: 101.0 / 255.0, blue: 34.0 / 255.0, alpha: 1) // brand #F26522
        config.baseForegroundColor = .white
        config.cornerStyle = .capsule
        config.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 36, bottom: 14, trailing: 36)
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var outgoing = incoming
            outgoing.font = .systemFont(ofSize: 17, weight: .bold)
            return outgoing
        }
        let button = UIButton(configuration: config)
        button.addAction(UIAction { [weak self] _ in self?.onRetry() }, for: .touchUpInside)
        stack.addArrangedSubview(button)

        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -32),
        ])
    }
}

/// The brand monogram (the "XO" mark) drawn as a vector so it stays crisp at
/// any size and never depends on a bundled raster that could go missing.
///
/// Mirrors `public/brand/xogridmaker_monogram.svg` (and the inline SVG in
/// `public/sw.js`) exactly — same 900×380 design space: two blue strokes form
/// the "X", a green rounded rectangle is the "O". Keeping the coordinates in
/// lockstep means the native offline screen and the web offline shell show the
/// identical mark.
final class MonogramView: UIView {
    /// The SVG viewBox the coordinates below are authored in.
    private static let designSize = CGSize(width: 900, height: 380)
    private static let blue = UIColor(red: 23 / 255, green: 105 / 255, blue: 255 / 255, alpha: 1) // #1769FF
    private static let green = UIColor(red: 149 / 255, green: 204 / 255, blue: 31 / 255, alpha: 1) // #95CC1F

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        contentMode = .redraw
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override var intrinsicContentSize: CGSize {
        CGSize(width: 152, height: 64)
    }

    override func draw(_ rect: CGRect) {
        // Fit the 900×380 design space into bounds, preserving aspect ratio.
        let scale = min(bounds.width / Self.designSize.width, bounds.height / Self.designSize.height)
        let inset = CGPoint(
            x: (bounds.width - Self.designSize.width * scale) / 2,
            y: (bounds.height - Self.designSize.height * scale) / 2
        )
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: inset.x + x * scale, y: inset.y + y * scale)
        }

        // "X" — two square-capped strokes, matching the SVG's stroke-linecap="square".
        let cross = UIBezierPath()
        cross.move(to: point(250, 100))
        cross.addLine(to: point(380, 240))
        cross.move(to: point(380, 100))
        cross.addLine(to: point(250, 240))
        cross.lineWidth = 52 * scale
        cross.lineCapStyle = .square
        Self.blue.setStroke()
        cross.stroke()

        // "O" — a green rounded-rect outline (fill: none in the SVG).
        let ring = UIBezierPath(
            roundedRect: CGRect(origin: point(480, 105), size: CGSize(width: 170 * scale, height: 130 * scale)),
            cornerRadius: 42 * scale
        )
        ring.lineWidth = 38 * scale
        Self.green.setStroke()
        ring.stroke()
    }
}
