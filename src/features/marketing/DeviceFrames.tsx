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
      <div className="relative h-full w-full overflow-hidden rounded-[18px] bg-white">
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
    <div className={`relative mx-auto w-full max-w-md ${className}`}>
      <div
        className="relative rounded-2xl bg-neutral-800 p-3 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.4)]"
        style={{
          transform: "perspective(800px) rotateX(18deg) rotateY(-8deg)",
        }}
      >
        <div className="rounded-lg bg-white p-2 ring-1 ring-black/10">
          {children}
        </div>
        <div className="absolute -left-2 top-1/2 h-16 w-4 -translate-y-1/2 rounded-l-md bg-neutral-900" />
        <div className="absolute -right-2 top-1/2 h-16 w-4 -translate-y-1/2 rounded-r-md bg-neutral-900" />
      </div>
    </div>
  );
}
