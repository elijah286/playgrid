"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { ShareDialog } from "./ShareDialog";

type Props = {
  /** Sharer's user id, used to attribute the referral link. Null when
   *  signed-out — link still works, just without attribution. */
  userId: string | null;
  /** Visual treatment. "header" matches existing header icon buttons;
   *  "inline" sizes for placement inside content surfaces. */
  variant?: "header" | "inline";
  /** Override aria/tooltip label per surface (e.g. "Share xogridmaker"
   *  in nav, "Share this page" elsewhere). */
  label?: string;
  className?: string;
};

export function ShareButton({
  userId,
  variant = "header",
  label = "Share xogridmaker",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const sizeCls =
    variant === "header"
      ? "size-9 rounded-lg"
      : "h-8 w-8 rounded-md";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={`inline-flex items-center justify-center text-muted transition-colors hover:bg-surface-inset hover:text-foreground ${sizeCls} ${className}`}
      >
        <Share2 className="size-4" />
      </button>
      {open && <ShareDialog userId={userId} onClose={() => setOpen(false)} />}
    </>
  );
}
