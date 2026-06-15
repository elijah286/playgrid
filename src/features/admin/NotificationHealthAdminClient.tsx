"use client";

import { useEffect, useState } from "react";
import {
  getNotificationHealthAction,
  type NotificationHealth,
} from "@/app/actions/notification-health";

export function NotificationHealthAdminClient() {
  const [health, setHealth] = useState<NotificationHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getNotificationHealthAction().then((res) => {
      if (!active) return;
      if (res.ok) setHealth(res.health);
      else setError(res.error);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p className="text-sm text-muted">Loading token health…</p>;
  if (error) {
    return (
      <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger ring-1 ring-danger/30">
        {error}
      </p>
    );
  }
  if (!health) return null;

  const reachTotal = health.coverage.usersReachable + health.coverage.usersOnlyDead;
  const reachPct = reachTotal > 0 ? Math.round((health.coverage.usersReachable / reachTotal) * 100) : 100;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Notification health</h2>
        <p className="mt-1 text-xs text-muted">
          Push-token reachability across devices. The 90d+ bucket is the dormant,
          at-risk population — tokens that may rotate before the app reopens.
          {health.truncated && " (Capped sample — counts are a floor.)"}
        </p>
      </div>

      {/* Reach */}
      <Card title="User reach">
        <div className="flex flex-wrap gap-6">
          <Stat label="Reachable users" value={health.coverage.usersReachable} />
          <Stat label="Only-dead tokens" value={health.coverage.usersOnlyDead} tone={health.coverage.usersOnlyDead > 0 ? "warn" : undefined} />
          <Stat label="Reachable %" value={`${reachPct}%`} />
        </div>
      </Card>

      {/* Platforms */}
      <Card title="Tokens by platform">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1">Platform</th>
              <th className="py-1">Active</th>
              <th className="py-1">Disabled</th>
            </tr>
          </thead>
          <tbody>
            {(["ios", "android", "web"] as const).map((p) => (
              <tr key={p} className="border-t border-border">
                <td className="py-1.5 font-medium text-foreground">{p}</td>
                <td className="py-1.5">{health.platforms[p].active}</td>
                <td className="py-1.5 text-muted">{health.platforms[p].disabled}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Freshness */}
      <Card title="Active-token freshness (last seen)">
        <div className="flex flex-wrap gap-6">
          <Stat label="< 7 days" value={health.freshness.d7} />
          <Stat label="7–30 days" value={health.freshness.d30} />
          <Stat label="30–90 days" value={health.freshness.d90} />
          <Stat label="90 days +" value={health.freshness.older} tone={health.freshness.older > 0 ? "warn" : undefined} />
        </div>
      </Card>

      {/* Dead reasons */}
      <Card title="Disabled-token reasons">
        {Object.keys(health.deadReasons).length === 0 ? (
          <p className="text-sm text-muted">No disabled tokens.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {Object.entries(health.deadReasons).map(([reason, count]) => (
              <li key={reason} className="flex justify-between">
                <span className="text-foreground">{reason}</span>
                <span className="text-muted">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-5">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "warn" }) {
  return (
    <div>
      <div className={tone === "warn" ? "text-2xl font-semibold text-warning" : "text-2xl font-semibold text-foreground"}>
        {value}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
