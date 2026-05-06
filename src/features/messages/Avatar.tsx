"use client";

import Image from "next/image";
import { avatarColorForUserId, initialsFor } from "./format";

/**
 * Round avatar — `avatar_url` if the profile has one, otherwise initials on
 * a deterministic colored background. Two sizes: 36px (bubble header) and
 * 28px (typing indicator / inline references).
 */
export function MessageAvatar({
  userId,
  displayName,
  avatarUrl,
  size = 36,
}: {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  size?: number;
}) {
  const initials = initialsFor(displayName, userId);
  const bg = avatarColorForUserId(userId);
  const fontSize = Math.round(size * 0.4);

  if (avatarUrl) {
    return (
      <span
        className="relative inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-black/5"
        style={{ width: size, height: size }}
      >
        <Image
          src={avatarUrl}
          alt={displayName ?? "Member"}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          unoptimized
        />
      </span>
    );
  }

  return (
    <span
      aria-label={displayName ?? "Member"}
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ring-1 ring-black/5"
      style={{ width: size, height: size, backgroundColor: bg, fontSize }}
    >
      {initials}
    </span>
  );
}
