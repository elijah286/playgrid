"use client";

import { ColorModeToggle } from "@/components/theme/ColorModeToggle";

export function SiteHeaderBar() {
  return (
    <div className="pointer-events-none absolute right-0 top-0 z-10 flex justify-end p-4">
      <div className="pointer-events-auto">
        <ColorModeToggle />
      </div>
    </div>
  );
}
