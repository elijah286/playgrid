import type { Metadata } from "next";
import Image from "next/image";

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
          I&apos;ve been coaching for years across flag football, youth tackle
          and middle school 7v7. All three of my kids are quarterbacks, so we
          spend a lot of time studying plays together — at the kitchen table,
          in the backyard, and on the drive home from practice. PlayGrid grew
          out of wanting a better tool for that: something fast enough to
          sketch on the sideline, clean enough to print on a wristband, and
          easy to share with the entire team.
        </p>
        <p>
          The goal is simple — make it easy to design plays, organize them
          into playbooks, and carry them to the field.
        </p>
        <p className="pt-4 text-sm">
          <em>Created by Elijah Kerry from Cedar Park.</em>
        </p>
      </div>
      <div className="mt-8 overflow-hidden rounded-lg">
        <Image
          src="/about/montage.jpg"
          alt="Coaching moments across flag football, youth tackle, and 7v7"
          width={1400}
          height={466}
          sizes="(min-width: 768px) 672px, 100vw"
          className="h-auto w-full"
          priority={false}
        />
      </div>
    </article>
  );
}
