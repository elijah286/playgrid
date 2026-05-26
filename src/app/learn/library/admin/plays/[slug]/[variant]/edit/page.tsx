import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import { isCurrentUserSiteAdmin } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
import {
  LIBRARY_VARIANTS,
  VARIANT_LABEL,
  slugToVariant,
  variantToSlug,
  type LibraryVariant,
} from "@/lib/learn/variant";

// Admin-only — no public crawling, no static generation.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit library play (admin) · XO Gridmaker",
  // Block search engines from indexing the admin surface, even
  // though it's also access-gated server-side.
  robots: { index: false, follow: false },
};

/** Phase 2b-1 placeholder. The Edit affordance on each library
 *  variant page (`/learn/library/plays/[slug]/[variant]`) routes here.
 *  Phase 2b-2 replaces this stub with the real override-edit flow:
 *  loads the catalog spec, opens it in the full PlayEditor (canEdit
 *  true, libraryMode false), and persists edits to a new
 *  `library_concept_overrides` table that the library page reads
 *  on top of the catalog.
 *
 *  Kept as a stub now (instead of a 404) so the Edit link is
 *  discoverable in production and the URL shape stays stable across
 *  the 2b-1 → 2b-2 transition. */
export default async function LibraryAdminEditPlayPage({
  params,
}: {
  params: Promise<{ slug: string; variant: string }>;
}) {
  // Admin-only — non-admins 404 (same way the rest of the library
  // beta-gates: nothing in the URL hints that this page exists).
  if (!(await isCurrentUserSiteAdmin())) notFound();

  const { slug, variant: variantSlug } = await params;
  const concept = CONCEPTS.find((c) => toLearnSlug(c.name) === slug);
  const variant = slugToVariant(variantSlug);
  if (!concept || !variant) notFound();
  if (!LIBRARY_VARIANTS.includes(variant as LibraryVariant)) notFound();
  const supported = (concept.variants ?? []).filter((v): v is LibraryVariant =>
    LIBRARY_VARIANTS.includes(v as LibraryVariant),
  );
  if (!supported.includes(variant)) notFound();

  const libraryHref = `/learn/library/plays/${slug}/${variantToSlug(variant)}`;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <Link
        href={libraryHref}
        className="mb-6 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to {concept.name} ({VARIANT_LABEL[variant]})
      </Link>
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        Library admin · Edit play
      </p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
        {concept.name}
        <span className="ml-3 text-xl font-semibold text-muted">
          · {VARIANT_LABEL[variant]}
        </span>
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        The override-edit flow ships in the next deploy. It opens this
        diagram in the full play editor (the same one in the in-app
        builder), with edits persisting to the{" "}
        <code className="rounded bg-surface-inset px-1 py-0.5 text-xs">
          library_concept_overrides
        </code>{" "}
        table that the library page reads on top of the catalog. For
        now the library page renders straight from the catalog spec.
      </p>
      <p className="mt-3 text-sm text-muted">
        If you spotted a correctness issue while walking the catalog,
        either{" "}
        <Link href="/admin" className="text-primary underline">
          flag it from the admin console
        </Link>{" "}
        or open an issue and we&apos;ll patch the catalog directly —
        catalog edits propagate to all variant pages without an
        override.
      </p>
    </main>
  );
}
