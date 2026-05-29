/**
 * Pure logic for native app open / install recording. Kept out of the
 * "use server" action file so it's unit-testable without a database — and so
 * the action file can export only async server functions (a Next.js
 * requirement for "use server" modules).
 */

export type AppPlatform = "android" | "ios";

export type AppInstallRow = {
  install_id: string;
  user_id: string | null;
  install_referrer: string | null;
};

export type AppOpenContext = {
  installId: string;
  platform: AppPlatform;
  userId: string | null;
  appVersion: string | null;
  installReferrer: string | null;
  now: string;
};

export type AppOpenWrite =
  | { action: "insert"; row: Record<string, unknown> }
  | { action: "update"; patch: Record<string, unknown> };

export function clipStr(v: string | null | undefined, max: number): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export function isAppPlatform(v: unknown): v is AppPlatform {
  return v === "android" || v === "ios";
}

/**
 * Decide the DB write for a native app open.
 *   - No existing row → INSERT: this first launch is the "install".
 *   - Existing row    → UPDATE: bump last_opened_at; attach user_id when known
 *     (never clear it); capture install_referrer once (never overwrite).
 *
 * first_opened_at is written only on insert, so it always marks the install
 * moment; repeat opens never touch it.
 */
export function buildAppOpenWrite(
  existing: AppInstallRow | null,
  ctx: AppOpenContext,
): AppOpenWrite {
  if (!existing) {
    return {
      action: "insert",
      row: {
        install_id: ctx.installId,
        user_id: ctx.userId,
        platform: ctx.platform,
        app_version: ctx.appVersion,
        install_referrer: ctx.installReferrer,
        first_opened_at: ctx.now,
        last_opened_at: ctx.now,
      },
    };
  }
  const patch: Record<string, unknown> = {
    last_opened_at: ctx.now,
    updated_at: ctx.now,
  };
  if (ctx.userId) patch.user_id = ctx.userId; // attach, never clear
  if (ctx.appVersion) patch.app_version = ctx.appVersion;
  if (ctx.installReferrer && !existing.install_referrer) {
    patch.install_referrer = ctx.installReferrer; // capture once
  }
  return { action: "update", patch };
}
