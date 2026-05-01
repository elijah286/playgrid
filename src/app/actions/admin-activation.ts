"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export type ActivationCohort = {
  bucket: string;
  count: number;
  percentage: number;
};

export type ActivationFunnel = {
  totalUsers: number;
  playbookCreators: number;
  playCreators: number;
  playCreators16Plus: number;
  coachAiUsers: number;
};

export type SportVariantDistribution = {
  variant: string;
  count: number;
  percentage: number;
};

export type MonetizationSummary = {
  cohorts: ActivationCohort[];
  funnel: ActivationFunnel;
  sportVariants: SportVariantDistribution[];
};

export async function getActivationSummaryAction(): Promise<
  { ok: true; summary: MonetizationSummary } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };

  try {
    const admin = createServiceRoleClient();

    // Get total users
    const { count: totalUsers } = await admin
      .from("profiles")
      .select("*", { count: "exact", head: true });

    // Get sport variant distribution
    const { data: sportVariantData } = await admin
      .from("playbooks")
      .select("sport_variant, id", { count: "exact" })
      .not("sport_variant", "is", null);

    // Get users grouped by play count
    const { data: playCounts, error: playCountsError } = await admin.rpc(
      "get_user_play_counts",
    ) as any;

    if (playCountsError) {
      // Fallback if RPC doesn't exist yet - compute manually
      const { data: users } = await admin.from("profiles").select("id");
      if (!users) return { ok: false, error: "Failed to fetch user data" };

      const { data: playcounts } = await admin
        .from("plays")
        .select(
          `
          playbooks!inner(team_id, teams!inner(org_id, organizations!inner(owner_id)))
        `,
        )
        .throwOnError();

      // Group by user and count
      const userPlayCounts: Record<string, number> = {};
      users.forEach((u) => {
        userPlayCounts[u.id] = 0;
      });

      if (playcounts) {
        playcounts.forEach((p: any) => {
          const ownerId = p.playbooks?.teams?.organizations?.owner_id;
          if (ownerId && userPlayCounts[ownerId] !== undefined) {
            userPlayCounts[ownerId]++;
          }
        });
      }

      const counts = Object.values(userPlayCounts);

      // Create cohorts
      const cohorts: ActivationCohort[] = [
        {
          bucket: "0 plays",
          count: counts.filter((c) => c === 0).length,
          percentage: 0,
        },
        {
          bucket: "1-5 plays",
          count: counts.filter((c) => c >= 1 && c <= 5).length,
          percentage: 0,
        },
        {
          bucket: "6-10 plays",
          count: counts.filter((c) => c >= 6 && c <= 10).length,
          percentage: 0,
        },
        {
          bucket: "11-15 plays",
          count: counts.filter((c) => c >= 11 && c <= 15).length,
          percentage: 0,
        },
        {
          bucket: "16+ plays",
          count: counts.filter((c) => c >= 16).length,
          percentage: 0,
        },
      ];

      const totalWithPlays = cohorts.reduce((sum, c) => sum + c.count, 0);
      cohorts.forEach((c) => {
        c.percentage = totalWithPlays > 0 ? c.count / totalWithPlays : 0;
      });

      // Funnel: we'll compute these from the same data
      const playbookCreators = counts.filter((c) => c >= 1).length;
      const playCreators = counts.filter((c) => c >= 1).length; // Same as above for now
      const playCreators16Plus = counts.filter((c) => c >= 16).length;

      // Coach AI users - would need separate tracking
      const coachAiUsers = 0; // TODO: track usage

      // Sport variant distribution
      const sportVariantCounts: Record<string, number> = {};
      if (sportVariantData) {
        sportVariantData.forEach((row: any) => {
          const variant = row.sport_variant || "unknown";
          sportVariantCounts[variant] = (sportVariantCounts[variant] || 0) + 1;
        });
      }
      const totalVariants = Object.values(sportVariantCounts).reduce(
        (sum, count) => sum + count,
        0,
      );
      const sportVariants: SportVariantDistribution[] = Object.entries(
        sportVariantCounts,
      )
        .map(([variant, count]) => ({
          variant,
          count: count as number,
          percentage: totalVariants > 0 ? (count as number) / totalVariants : 0,
        }))
        .sort((a, b) => b.count - a.count);

      return {
        ok: true,
        summary: {
          cohorts,
          funnel: {
            totalUsers: totalUsers ?? 0,
            playbookCreators,
            playCreators,
            playCreators16Plus,
            coachAiUsers,
          },
          sportVariants,
        },
      };
    }

    // If RPC exists, use it
    const counts = playCounts || [];

    const cohorts: ActivationCohort[] = [
      {
        bucket: "0 plays",
        count: counts.find((c: any) => c.bucket === "0")?.count ?? 0,
        percentage: 0,
      },
      {
        bucket: "1-5 plays",
        count: counts.find((c: any) => c.bucket === "1-5")?.count ?? 0,
        percentage: 0,
      },
      {
        bucket: "6-10 plays",
        count: counts.find((c: any) => c.bucket === "6-10")?.count ?? 0,
        percentage: 0,
      },
      {
        bucket: "11-15 plays",
        count: counts.find((c: any) => c.bucket === "11-15")?.count ?? 0,
        percentage: 0,
      },
      {
        bucket: "16+ plays",
        count: counts.find((c: any) => c.bucket === "16+")?.count ?? 0,
        percentage: 0,
      },
    ];

    const totalWithPlays = cohorts.reduce((sum, c) => sum + c.count, 0);
    cohorts.forEach((c) => {
      c.percentage = totalWithPlays > 0 ? c.count / totalWithPlays : 0;
    });

    const funnel: ActivationFunnel = {
      totalUsers: totalUsers ?? 0,
      playbookCreators: totalWithPlays,
      playCreators: totalWithPlays,
      playCreators16Plus: cohorts.find((c) => c.bucket === "16+ plays")?.count ?? 0,
      coachAiUsers: 0, // TODO: track usage
    };

    // Sport variant distribution
    const sportVariantCounts: Record<string, number> = {};
    if (sportVariantData) {
      sportVariantData.forEach((row: any) => {
        const variant = row.sport_variant || "unknown";
        sportVariantCounts[variant] = (sportVariantCounts[variant] || 0) + 1;
      });
    }
    const totalVariants = Object.values(sportVariantCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    const sportVariants: SportVariantDistribution[] = Object.entries(
      sportVariantCounts,
    )
      .map(([variant, count]) => ({
        variant,
        count: count as number,
        percentage: totalVariants > 0 ? (count as number) / totalVariants : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      ok: true,
      summary: {
        cohorts,
        funnel,
        sportVariants,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: msg };
  }
}
