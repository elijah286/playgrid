import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentLeagueMemberships, isLeagueAdminRole } from "@/lib/league/access";
import { getFinancialsAction } from "@/app/actions/league-financials";

export const metadata: Metadata = {
  title: "Financials · League Console · XO Gridmaker",
};

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function FinancialsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  const memberships = await getCurrentLeagueMemberships();
  if (!memberships.some((m) => m.leagueId === leagueId && isLeagueAdminRole(m.role))) notFound();

  const f = await getFinancialsAction(leagueId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <Link href={`/league/${leagueId}`} className="text-xs text-muted hover:underline">
        ← Console
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Financials</h1>
      <p className="mt-1 text-sm text-muted">
        Registration revenue for this league. Add-on prices and fees are snapshotted at signup.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface-raised p-4">
          <div className="text-xs font-medium text-muted">Collected</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {money(f.collectedCents)}
          </div>
          <div className="mt-1 text-xs text-muted">
            {f.paidCount} paid {f.paidCount === 1 ? "registration" : "registrations"}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface-raised p-4">
          <div className="text-xs font-medium text-muted">Outstanding</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{money(f.outstandingCents)}</div>
          <div className="mt-1 text-xs text-muted">
            {f.unpaidCount} unpaid {f.unpaidCount === 1 ? "registration" : "registrations"}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface-raised p-4">
          <div className="text-xs font-medium text-muted">Registrations</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{f.totalRegistrations}</div>
          <div className="mt-1 text-xs text-muted">
            {f.paidCount} paid · {f.unpaidCount} unpaid
          </div>
        </div>
      </div>

      <h2 className="mb-2 mt-8 text-sm font-semibold">Collected breakdown</h2>
      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-border">
            <tr>
              <td className="px-4 py-3 text-muted">Registration fees</td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                {money(f.feeCollectedCents)}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-muted">Add-ons (store items)</td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                {money(f.addOnCollectedCents)}
              </td>
            </tr>
            {f.refundedCents > 0 ? (
              <tr>
                <td className="px-4 py-3 text-muted">Refunded</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {money(f.refundedCents)}
                </td>
              </tr>
            ) : null}
            {f.waivedCents > 0 ? (
              <tr>
                <td className="px-4 py-3 text-muted">Waived</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {money(f.waivedCents)}
                </td>
              </tr>
            ) : null}
            <tr className="bg-foreground/5">
              <td className="px-4 py-3 font-semibold text-foreground">Total collected</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                {money(f.collectedCents)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-2xl border border-border p-4 text-sm text-muted">
        {f.paymentsEnabled ? (
          <>
            Online payments are active — funds are paid out directly to your connected Stripe
            account on Stripe&apos;s payout schedule.
          </>
        ) : (
          <>
            Online payments aren&apos;t set up yet, so these totals reflect amounts owed.{" "}
            <Link href={`/league/${leagueId}/registration`} className="text-primary hover:underline">
              Connect Stripe
            </Link>{" "}
            to collect registration fees online.
          </>
        )}
      </div>
    </div>
  );
}
