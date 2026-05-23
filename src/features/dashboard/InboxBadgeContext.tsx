"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/** Client-side optimistic state for the inbox red badge.
 *
 *  The badge is server-rendered by (dashboard)/layout.tsx — it counts
 *  active inbox alerts at request time and passes the number through to
 *  HomeBottomNav (mobile) and HomeTabNav (desktop). That's accurate but
 *  it only refreshes when the layout re-runs, so a coach who archives
 *  an alert sees the badge linger for several hundred ms while the
 *  router.refresh() round-trip completes.
 *
 *  This provider papers over that gap: it holds a set of alert keys the
 *  user has already dismissed in this session, and reports
 *  count = baseline - resolvedKeys.size. When the layout re-renders
 *  with a fresh server count, the baseline updates and the resolved set
 *  clears — the server is authoritative once it catches up.
 *
 *  Race condition: if the user archives during an in-flight refresh,
 *  the resolved set is cleared the moment the (stale) lower count
 *  arrives and the badge briefly jumps back up by one. Self-corrects
 *  on the next refresh. Acceptable for the badge — anything stronger
 *  would require coordinating action timestamps with the server fetch.
 */

type InboxBadgeContextValue = {
  count: number;
  urgent: boolean;
  /** Mark an alert as no longer counting toward the badge. Idempotent. */
  resolveOptimistically: (key: string) => void;
  /** Undo a previous optimistic resolve — call when the server action fails. */
  reviveOptimistically: (key: string) => void;
};

const NOOP_VALUE: InboxBadgeContextValue = {
  count: 0,
  urgent: false,
  resolveOptimistically: () => {},
  reviveOptimistically: () => {},
};

const InboxBadgeContext = createContext<InboxBadgeContextValue | null>(null);

export function InboxBadgeProvider({
  initialCount,
  initialUrgent,
  children,
}: {
  initialCount: number;
  initialUrgent: boolean;
  children: React.ReactNode;
}) {
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setResolvedKeys((prev) => (prev.size === 0 ? prev : new Set()));
  }, [initialCount, initialUrgent]);

  const resolveOptimistically = useCallback((key: string) => {
    setResolvedKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const reviveOptimistically = useCallback((key: string) => {
    setResolvedKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const value = useMemo<InboxBadgeContextValue>(() => {
    const count = Math.max(0, initialCount - resolvedKeys.size);
    return {
      count,
      urgent: count > 0 && initialUrgent,
      resolveOptimistically,
      reviveOptimistically,
    };
  }, [
    initialCount,
    initialUrgent,
    resolvedKeys,
    resolveOptimistically,
    reviveOptimistically,
  ]);

  return (
    <InboxBadgeContext.Provider value={value}>
      {children}
    </InboxBadgeContext.Provider>
  );
}

export function useInboxBadge(): InboxBadgeContextValue {
  return useContext(InboxBadgeContext) ?? NOOP_VALUE;
}
