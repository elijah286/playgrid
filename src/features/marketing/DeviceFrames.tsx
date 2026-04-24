import type { ReactNode } from "react";

/**
 * Pure-CSS device frames so marketing screenshots look like real products
 * without shipping image assets. Screens are passed as children; the frame
 * provides bezel, notch/speaker, and shadow.
 */

export function PhoneFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative mx-auto w-[260px] rounded-[40px] bg-neutral-900 p-2 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.35)] ring-1 ring-black/20 ${className}`}
      style={{ aspectRatio: "9 / 19.5" }}
    >
      <div className="absolute left-1/2 top-3 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
      <div className="relative h-full w-full overflow-hidden rounded-[32px] bg-white">
        {children}
      </div>
    </div>
  );
}

export function TabletFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative mx-auto w-[520px] max-w-full rounded-[28px] bg-neutral-900 p-3 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.4)] ring-1 ring-black/20 ${className}`}
      style={{ aspectRatio: "4 / 3" }}
    >
      <div className="absolute inset-3 overflow-hidden rounded-[18px] bg-white [&>*]:!h-full [&>*]:!w-full [&_img]:!h-full [&_img]:!w-full [&_img]:object-cover [&_img]:object-top">
        {children}
      </div>
    </div>
  );
}

export function LaptopFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-3xl ${className}`}>
      <div
        className="relative rounded-t-2xl bg-neutral-900 p-2 pb-1 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.35)] ring-1 ring-black/20"
        style={{ aspectRatio: "16 / 10" }}
      >
        <div className="absolute left-1/2 top-1 h-1.5 w-16 -translate-x-1/2 rounded-full bg-neutral-800" />
        <div className="relative mt-2 h-[calc(100%-0.5rem)] w-full overflow-hidden rounded-lg bg-white">
          {children}
        </div>
      </div>
      <div className="mx-auto h-3 w-[110%] -translate-x-[5%] rounded-b-2xl bg-gradient-to-b from-neutral-700 to-neutral-800 shadow-lg" />
      <div className="mx-auto h-1 w-24 rounded-b-lg bg-neutral-800" />
    </div>
  );
}

/**
 * Wristband — a printed strip of plays wrapping around a wrist. Uses a
 * curved perspective to suggest depth without needing a photo.
 */
export function WristBand({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative mx-auto w-full max-w-lg ${className}`}>
      <div
        className="relative shadow-[0_30px_60px_-15px_rgba(0,0,0,0.45)]"
        style={{
          transform: "perspective(1100px) rotateX(10deg)",
        }}
      >
        {/* Top strap */}
        <div
          className="h-14 rounded-t-[18px] ring-1 ring-black/50"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 5px), linear-gradient(180deg,#0f0f0f 0%,#2b2b2b 55%,#1a1a1a 100%)",
          }}
        />
        {/* Card window — black bezel hugging the artwork */}
        <div className="relative bg-neutral-900 px-3 py-2 ring-1 ring-black/60">
          <div className="overflow-hidden rounded-[3px] bg-white ring-1 ring-black/20">
            {children}
          </div>
        </div>
        {/* Bottom strap */}
        <div
          className="h-14 rounded-b-[18px] ring-1 ring-black/50"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 5px), linear-gradient(180deg,#1a1a1a 0%,#2b2b2b 45%,#0f0f0f 100%)",
          }}
        />
      </div>
    </div>
  );
}
