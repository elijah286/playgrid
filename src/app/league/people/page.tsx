import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { listAccessGrantsAction } from "@/app/actions/league-access";
import { PeopleAccessManager } from "@/features/league/PeopleAccessManager";

export const metadata: Metadata = {
  title: "People & access · League Operations · XO Gridmaker",
};

export default async function PeoplePage() {
  const res = await listAccessGrantsAction();
  if (!res.ok) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 text-foreground sm:px-6">
      <Link href="/league" className="text-xs text-muted hover:underline">
        ← League Operations
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">People &amp; access</h1>
      <p className="mt-1 text-sm text-muted">
        Invite teammates and scope what they can do — by role and across which leagues. Team-level
        help (coaches) is handled in the classic coach experience.
      </p>

      <div className="mt-6">
        <PeopleAccessManager initial={res.data} />
      </div>
    </div>
  );
}
