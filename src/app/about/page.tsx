import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About · PlayGrid",
  description: "Why PlayGrid exists — built by a coach, for coaches.",
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-extrabold tracking-tight">About PlayGrid</h1>
      <div className="mt-6 space-y-5 text-base leading-relaxed text-muted">
        <p>
          PlayGrid is a football play designer built for coaches who want to
          spend more time coaching and less time fighting with PowerPoint,
          whiteboards, or napkin sketches.
        </p>
        <p>
          I&apos;ve been coaching for five years across youth flag football,
          youth tackle, and middle school 7v7. All three of my kids are
          quarterbacks, so we spend a lot of time studying plays together —
          at the kitchen table, in the backyard, and on the drive home from
          practice. PlayGrid grew out of wanting a better tool for that:
          something fast enough to sketch on the sideline, clean enough to
          print on a wristband, and shareable enough to send to a 10-year-old
          QB&apos;s phone.
        </p>
        <p>
          The goal is simple — make it easy to design plays, organize them
          into playbooks, and carry them to the field.
        </p>
        <p className="pt-4 text-sm">
          <em>Created by Elijah Kerry from Cedar Park.</em>
        </p>
      </div>
    </article>
  );
}
