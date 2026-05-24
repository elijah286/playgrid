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
 *  The badge baseline starts from a server-rendered count (root layout
 *  passes it via initialCount/initialUrgent) and stays live in two ways:
 *  (1) `resolveOptimistically(key)` hides items the user just archived
 *  before the network round-trip lands, (2) `updateBaseline(c, u)` lets
 *  a background poller push a fresh server count without forcing a full
 *  route refresh. The reported count is `baseline - resolvedKeys.size`,
 *  so the two layers compose naturally.
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
  /** Push a fresh server-side baseline. Used by the poll-based refresher
   *  to keep the badge live mid-session without a full router.refresh().
   *  Clears the optimistic resolved set since the new baseline is
   *  authoritative. */
  updateBaseline: (count: number, urgent: boolean) => void;
};

const NOOP_VALUE: InboxBadgeContextValue = {
  count: 0,
  urgent: false,
  resolveOptimistically: () => {},
  reviveOptimistically: () => {},
  updateBaseline: () => {},
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
  const [baselineCount, setBaselineCount] = useState(initialCount);
  const [baselineUrgent, setBaselineUrgent] = useState(initialUrgent);
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(
    () => new Set(),
  );

  // Re-sync when the server-rendered props change (parent layout
  // re-renders with a different baseline, e.g. after router.refresh()).
  useEffect(() => {
    setBaselineCount(initialCount);
    setBaselineUrgent(initialUrgent);
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

  const updateBaseline = useCallback((count: number, urgent: boolean) => {
    setBaselineCount(count);
    setBaselineUrgent(urgent);
    setResolvedKeys((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const value = useMemo<InboxBadgeContextValue>(() => {
    const count = Math.max(0, baselineCount - resolvedKeys.size);
    return {
      count,
      urgent: count > 0 && baselineUrgent,
      resolveOptimistically,
      reviveOptimistically,
      updateBaseline,
    };
  }, [
    baselineCount,
    baselineUrgent,
    resolvedKeys,
    resolveOptimistically,
    reviveOptimistically,
    updateBaseline,
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
