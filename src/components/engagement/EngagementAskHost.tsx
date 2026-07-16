"use client";

import { useEffect, useRef, useState } from "react";
import {
  checkEngagementAsk,
  claimEngagementAsk,
  type EngagementAsk,
} from "@/app/actions/engagement-ask";
import {
  useFirstRunModalSlot,
  FIRST_RUN_PRIORITY,
} from "@/components/onboarding/FirstRunModalQueue";
import { RatingAsk } from "@/components/native/RatingAsk";
import { ReferralAsk } from "@/components/referral/ReferralAsk";
import { useEngagementMoment } from "./useEngagementMoment";

/**
 * The single mount point for every interruptive engagement ask. Nothing else
 * may render one.
 *
 * Three things have to be true before a coach is interrupted, and each is
 * enforced at a different layer because each can fail differently:
 *
 *  1. It's a decent moment       — useEngagementMoment (warmup + a navigation,
 *                                  or a peak moment). Client-side; advisory.
 *  2. This ask outranks the rest — checkEngagementAsk picks ONE by priority
 *                                  from the eligible candidates, server-side.
 *  3. Nothing else has the screen — the first-run queue keeps us behind the
 *                                  terms gate and the native welcome, and
 *                                  claimEngagementAsk reserves the 14-day
 *                                  window atomically at the instant of display.
 *
 * Step 3's ordering is the load-bearing part. Eligibility is checked without
 * writing anything, so an ask that never reaches the screen stays owed; the
 * reservation happens only when it actually displays. Before this, the two asks
 * each self-gated on their own read of the cooldown, both read it before either
 * wrote it, and a coach got both.
 */
export function EngagementAskHost() {
  const [candidate, setCandidate] = useState<EngagementAsk | null>(null);
  const [claimed, setClaimed] = useState(false);
  const moment = useEngagementMoment();
  const checkedRef = useRef(false);
  const claimingRef = useRef(false);

  // Don't even ask the server until it's a reasonable time to interrupt.
  useEffect(() => {
    if (!moment || checkedRef.current) return undefined;
    checkedRef.current = true;
    let cancelled = false;
    void checkEngagementAsk().then((ask) => {
      if (!cancelled) setCandidate(ask);
    });
    return () => {
      cancelled = true;
    };
  }, [moment]);

  const visible = useFirstRunModalSlot(
    FIRST_RUN_PRIORITY.engagementAsk,
    !!candidate,
  );

  // Reserve only once we actually own the screen. Losing the race means some
  // other ask (another tab, a concurrent mount) got this window — drop ours
  // silently rather than stacking on top of it.
  useEffect(() => {
    if (!visible || !candidate || claimingRef.current) return undefined;
    claimingRef.current = true;
    let cancelled = false;
    void claimEngagementAsk().then((won) => {
      if (cancelled) return;
      if (won) setClaimed(true);
      else setCandidate(null);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, candidate]);

  if (!visible || !claimed || !candidate) return null;

  const dismiss = () => setCandidate(null);

  if (candidate.kind === "rating") return <RatingAsk onDone={dismiss} />;
  return (
    <ReferralAsk
      perReferralLabel={candidate.perReferralLabel}
      recipientTrialDays={candidate.recipientTrialDays}
      onDone={dismiss}
    />
  );
}
