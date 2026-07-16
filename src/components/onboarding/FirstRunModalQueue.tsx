"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

/**
 * Coordinates the first-run modals so a brand-new coach sees them ONE AT A TIME,
 * in priority order, and never stacked on top of the blocking terms/name gate.
 *
 * Before this, NativeWelcomeSpotlight and ReferralAnnouncementNudge each mounted
 * independently in the dashboard layout and self-gated in isolation, so on a
 * new user's first authed load BOTH fired at once — on top of the (also-showing)
 * terms acceptance prompt. Three modals stacked. See the dashboard layout.
 *
 * A modal declares its priority (higher = shown first) and whether its own
 * gating currently wants it shown; the hook returns true for exactly one modal
 * at a time. `blocked` lets the layout reserve the screen for a higher-priority
 * BLOCKING gate (terms acceptance, name capture) that lives outside the queue.
 */

export type ModalClaim = { id: string; priority: number };

/**
 * Pure selection: the id of the highest-priority claim that should show, or null
 * when a blocking gate owns the screen (`blocked`) or nothing is claiming.
 * Ties resolve to the first claim registered. Exported for unit testing.
 */
export function pickActiveClaim(
  claims: ModalClaim[],
  blocked: boolean,
): string | null {
  if (blocked) return null;
  let best: ModalClaim | null = null;
  for (const claim of claims) {
    if (best === null || claim.priority > best.priority) best = claim;
  }
  return best ? best.id : null;
}

type QueueValue = {
  register: (id: string, priority: number) => void;
  unregister: (id: string) => void;
  activeId: string | null;
};

const FirstRunModalQueueContext = createContext<QueueValue | null>(null);

export function FirstRunModalQueueProvider({
  blocked = false,
  children,
}: {
  blocked?: boolean;
  children: React.ReactNode;
}) {
  const [claims, setClaims] = useState<ModalClaim[]>([]);

  const register = useCallback((id: string, priority: number) => {
    setClaims((prev) => {
      const existing = prev.find((c) => c.id === id);
      if (existing && existing.priority === priority) return prev;
      // Keep registration order (drop-and-append) so ties are stable.
      return [...prev.filter((c) => c.id !== id), { id, priority }];
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setClaims((prev) =>
      prev.some((c) => c.id === id) ? prev.filter((c) => c.id !== id) : prev,
    );
  }, []);

  const activeId = useMemo(
    () => pickActiveClaim(claims, blocked),
    [claims, blocked],
  );

  const value = useMemo(
    () => ({ register, unregister, activeId }),
    [register, unregister, activeId],
  );

  return (
    <FirstRunModalQueueContext.Provider value={value}>
      {children}
    </FirstRunModalQueueContext.Provider>
  );
}

/**
 * A first-run modal calls this with its priority and whether its OWN gating says
 * it's eligible (`want`). Returns true only when this modal is the one that
 * should actually render right now. Fails OPEN (returns `want`) when no provider
 * is mounted, so a modal still works standalone.
 */
export function useFirstRunModalSlot(priority: number, want: boolean): boolean {
  const ctx = useContext(FirstRunModalQueueContext);
  const id = useId();

  useEffect(() => {
    if (!ctx) return undefined;
    if (want) {
      ctx.register(id, priority);
      return () => ctx.unregister(id);
    }
    ctx.unregister(id);
    return undefined;
  }, [ctx, id, priority, want]);

  if (!ctx) return want;
  return want && ctx.activeId === id;
}

/** Priority ladder for the first-run queue. Higher shows first. Terms & name
 *  capture are handled via the provider's `blocked` flag, above all of these.
 *
 *  Education outranks extraction: the native welcome explains what the coach
 *  just installed, so it goes before any ask for a rating or a referral. The
 *  asks themselves share ONE slot (`engagementAsk`) — EngagementAskHost picks
 *  which of them fills it, so they can never occupy two rungs at once. That is
 *  why there is no per-ask entry here; adding one would let two asks queue up
 *  behind each other and re-create the pile this ladder exists to prevent. */
export const FIRST_RUN_PRIORITY = {
  nativeWelcome: 200,
  engagementAsk: 100,
} as const;
