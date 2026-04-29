"use client";

import { useEffect, useRef } from "react";

type Props = {
  poster: string;
  mp4: string;
  webm: string;
};

/**
 * Hero walkthrough video. The standard `autoPlay muted playsInline` combo
 * is enough on most browsers, but Safari (Low Power Mode), some Android
 * builds, and iOS Low Data Mode silently block first-frame autoplay. This
 * wrapper:
 *   - calls `play()` explicitly on mount and when the element scrolls into
 *     view (covers the case where the page is opened in a background tab),
 *   - retries on `visibilitychange` so a backgrounded → foregrounded tab
 *     resumes playback.
 *
 * All retries are best-effort — if the browser still refuses (e.g. the
 * page hasn't received a user gesture yet) we accept the poster image as
 * the fallback rather than surfacing controls.
 */
export function HeroWalkthroughVideo({ poster, mp4, webm }: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Belt-and-suspenders: re-assert muted via the property (not just the
    // attribute), since some browsers ignore the attribute if the
    // element was created via JS / hydrated. Without this, autoplay can
    // be silently blocked.
    el.muted = true;
    el.defaultMuted = true;
    el.setAttribute("muted", "");
    el.playsInline = true;

    const tryPlay = () => {
      const p = el.play();
      if (p && typeof p.catch === "function")
        p.catch(() => {
          // If a user gesture is required, wire one up so the next click
          // anywhere kicks playback off.
          const onGesture = () => {
            el.play().catch(() => {});
            window.removeEventListener("pointerdown", onGesture);
            window.removeEventListener("keydown", onGesture);
            window.removeEventListener("touchstart", onGesture);
          };
          window.addEventListener("pointerdown", onGesture, { once: true });
          window.addEventListener("keydown", onGesture, { once: true });
          window.addEventListener("touchstart", onGesture, { once: true });
        });
    };

    // If metadata isn't loaded yet, play() can fail silently.
    if (el.readyState >= 2) tryPlay();
    else el.addEventListener("loadeddata", tryPlay, { once: true });

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && el.paused) tryPlay();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);

    const onVisible = () => {
      if (document.visibilityState === "visible" && el.paused) tryPlay();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <video
      ref={ref}
      className="block h-full w-full object-cover object-top"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      controls={false}
      disablePictureInPicture
      poster={poster}
    >
      <source src={mp4} type="video/mp4" />
      <source src={webm} type="video/webm" />
    </video>
  );
}
