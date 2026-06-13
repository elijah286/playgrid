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

        // Reuse the bundled launch image for branding; skip gracefully if the
        // asset name ever changes.
        if let logo = UIImage(named: "Splash") {
            let imageView = UIImageView(image: logo)
            imageView.contentMode = .scaleAspectFit
            imageView.translatesAutoresizingMaskIntoConstraints = false
            imageView.heightAnchor.constraint(equalToConstant: 88).isActive = true
            imageView.widthAnchor.constraint(equalToConstant: 88).isActive = true
            stack.addArrangedSubview(imageView)
            stack.setCustomSpacing(24, after: imageView)
        }

        let title = UILabel()
        title.text = "Can’t reach xogridmaker"
        title.font = .systemFont(ofSize: 18, weight: .bold)
        title.textColor = .label
        title.textAlignment = .center
        title.numberOfLines = 0
        stack.addArrangedSubview(title)

        let subtitle = UILabel()
        subtitle.text = "You appear to be offline or on a weak connection. Any playbooks you’ve downloaded are still available."
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
