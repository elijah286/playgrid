"use client";

import { usePathname } from "next/navigation";

/**
 * Hides production chrome (SiteHeader, SiteFooter, app-install banners) inside
 * the new-UX preview shell at `/app/*`, which provides its own chrome. Same
 * self-hiding pattern the editor/viewer/playbook surfaces already use — it is
 * pathname-gated, so it has zero effect on any production route.
 */
export function HideOnAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/app" || pathname?.startsWith("/app/")) return null;
  return <>{children}</>;
}
