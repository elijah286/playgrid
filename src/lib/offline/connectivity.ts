"use client";

import { isNativeApp } from "@/lib/native/isNativeApp";

/**
 * Real connectivity detection for the native shell.
 *
 * `navigator.onLine` is unreliable inside WKWebView — on a cold launch in
 * airplane mode it routinely reports `true` (reproduced on iOS 26 sim and
 * customer devices, 2026-07-15). Every consumer that routed on it (playbook
 * tiles picking /playbooks/<id> over /offline/<id>, OfflineGate, the error
 * boundary's "Go home") therefore sent offline coaches down network-only
 * paths that ended in "Something went wrong."
 *
 * This module keeps a single page-wide connectivity snapshot:
 * - The `offline` event is trusted immediately (browsers don't fire it
 *   spuriously). The `online` event and any `navigator.onLine === true`
 *   reading in the NATIVE shell are verified with a tiny same-origin probe
 *   (GET /api/health, no-store — the SW deliberately doesn't intercept
 *   /api/*). Any HTTP response, even an error status, proves the network
 *   path works; only a rejected/timed-out fetch means offline.
 * - While offline, we re-probe on an interval so recovery flips the state
 *   back without relying on the (equally unreliable) `online` event.
 * - On the plain web, `navigator.onLine` is kept as-is: browsers report it
 *   correctly there, and probing every visitor would be wasted traffic.
 *
 * Exposed as an external store (subscribe/getSnapshot) so all hook
 * consumers share ONE probe loop instead of racing their own.
 */

const PROBE_URL = "/api/health";
const PROBE_TIMEOUT_MS = 2500;
/** Re-probe cadence while offline, so recovery is noticed promptly. */
const OFFLINE_REPROBE_MS = 8000;
/**
 * Consecutive failed probes required to flip online→offline. A single failed
 * probe is NOT enough: under transient device-side congestion (e.g. a burst
 * of background fetches saturating the radio) even a healthy /api/health can
 * time out once, and flipping the whole app to "offline" on that one blip is
 * exactly the false-offline that stranded users during the precache storm.
 * Recovery (offline→online) is still immediate on the first success. The OS
 * `offline` event stays trusted-immediately for genuine airplane-mode.
 */
const FAILURE_THRESHOLD = 2;
/** Quick re-probe to confirm a suspected drop before committing to offline. */
const CONFIRM_REPROBE_MS = 1200;

let online = true;
let started = false;
let probeInFlight: Promise<boolean> | null = null;
let reprobeTimer: ReturnType<typeof setTimeout> | null = null;
let confirmTimer: ReturnType<typeof setTimeout> | null = null;
let consecutiveFailures = 0;
const listeners = new Set<() => void>();

function emit(next: boolean) {
  if (next === online) return;
  online = next;
  listeners.forEach((l) => l());
}

function scheduleReprobe() {
  if (reprobeTimer) return;
  reprobeTimer = setTimeout(() => {
    reprobeTimer = null;
    void probeConnectivity();
  }, OFFLINE_REPROBE_MS);
}

/** A short confirmation re-probe after a first failure while still online. */
function scheduleConfirmReprobe() {
  if (confirmTimer || reprobeTimer) return;
  confirmTimer = setTimeout(() => {
    confirmTimer = null;
    void probeConnectivity();
  }, CONFIRM_REPROBE_MS);
}

/**
 * Ask the network, not the flag. Resolves with the (debounced) online state —
 * NOT the raw single-probe result — so imperative callers don't act offline on
 * a blip. Concurrent callers share one in-flight probe.
 */
export function probeConnectivity(): Promise<boolean> {
  if (typeof fetch === "undefined") return Promise.resolve(online);
  if (probeInFlight) return probeInFlight;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  probeInFlight = fetch(PROBE_URL, {
    method: "GET",
    cache: "no-store",
    signal: controller.signal,
  })
    .then(() => true)
    .catch(() => false)
    .then((ok) => {
      clearTimeout(timer);
      probeInFlight = null;
      if (ok) {
        // Any successful probe clears the failure streak and restores online
        // immediately — recovery should never lag.
        consecutiveFailures = 0;
        if (confirmTimer) {
          clearTimeout(confirmTimer);
          confirmTimer = null;
        }
        emit(true);
      } else {
        consecutiveFailures += 1;
        if (online && consecutiveFailures < FAILURE_THRESHOLD) {
          // Suspected drop, not confirmed — hold online and re-probe soon.
          scheduleConfirmReprobe();
        } else {
          if (confirmTimer) {
            clearTimeout(confirmTimer);
            confirmTimer = null;
          }
          emit(false);
          scheduleReprobe();
        }
      }
      return online;
    });
  return probeInFlight;
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  online = typeof navigator === "undefined" ? true : navigator.onLine;

  window.addEventListener("offline", () => {
    // Real OS signal — trust it immediately, bypassing the probe debounce
    // (browsers don't fire `offline` spuriously; this is genuine airplane
    // mode / radio loss).
    consecutiveFailures = FAILURE_THRESHOLD;
    if (confirmTimer) {
      clearTimeout(confirmTimer);
      confirmTimer = null;
    }
    emit(false);
    scheduleReprobe();
  });
  window.addEventListener("online", () => {
    if (isNativeApp()) {
      // WKWebView also fires spurious `online` events; verify.
      void probeConnectivity();
    } else {
      emit(true);
    }
  });

  if (isNativeApp()) {
    // The flag can't be trusted in the WebView: verify the initial reading
    // and re-verify whenever the app returns to the foreground (radio state
    // usually changed while backgrounded — that's the airplane-mode toggle).
    void probeConnectivity();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void probeConnectivity();
    });
  }
}

export function subscribeConnectivity(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConnectivitySnapshot(): boolean {
  return online;
}

/** SSR snapshot — render as online so server markup matches the default. */
export function getConnectivityServerSnapshot(): boolean {
  return true;
}

/** Test-only: reset module state between cases. */
export function __resetConnectivityForTests(): void {
  online = true;
  started = false;
  probeInFlight = null;
  if (reprobeTimer) clearTimeout(reprobeTimer);
  reprobeTimer = null;
  if (confirmTimer) clearTimeout(confirmTimer);
  confirmTimer = null;
  consecutiveFailures = 0;
  listeners.clear();
}
