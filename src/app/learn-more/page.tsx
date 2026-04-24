import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learn more · xogridmaker",
  description: "A closer look at what xogridmaker can do.",
};

export default function LearnMorePage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-extrabold tracking-tight">Learn more</h1>
      <p className="mt-6 text-base leading-relaxed text-muted">
        Marketing content coming soon.
      </p>
    </article>
  );
}
