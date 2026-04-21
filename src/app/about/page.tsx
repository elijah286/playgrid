import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "About · PlayGrid",
  description: "Why PlayGrid exists — built by a coach, for coaches.",
};

const montage: Array<{
  src: string;
  alt: string;
  className: string;
  sizes: string;
}> = [
  {
    src: "/about/coach-sons.jpg",
    alt: "Coach with his two sons in Cedar Park Timberwolves gear",
    className: "md:col-span-2 md:row-span-2",
    sizes: "(min-width: 768px) 50vw, 100vw",
  },
  {
    src: "/about/chiefs-team.jpg",
    alt: "Flag football Chiefs team photo with coaches",
    className: "md:col-span-2",
    sizes: "(min-width: 768px) 50vw, 100vw",
  },
  {
    src: "/about/bulldogs-huddle.jpg",
    alt: "Youth tackle team huddling under the Bulldog Field scoreboard",
    className: "md:col-span-2",
    sizes: "(min-width: 768px) 50vw, 100vw",
  },
  {
    src: "/about/tackle-huddle.jpg",
    alt: "Youth tackle team huddle on the sideline",
    className: "",
    sizes: "(min-width: 768px) 25vw, 50vw",
  },
  {
    src: "/about/wolves-7v7.jpg",
    alt: "Middle school Wolves 7v7 team",
    className: "",
    sizes: "(min-width: 768px) 25vw, 50vw",
  },
  {
    src: "/about/cedar-park-kids.jpg",
    alt: "Cedar Park youth football players posing on the field",
    className: "md:col-span-2",
    sizes: "(min-width: 768px) 50vw, 100vw",
  },
  {
    src: "/about/flag-action.jpg",
    alt: "Flag football action on the field",
    className: "md:col-span-2",
    sizes: "(min-width: 768px) 50vw, 100vw",
  },
  {
    src: "/about/rings.jpg",
    alt: "Celebrating a championship with rings",
    className: "md:col-span-2",
    sizes: "(min-width: 768px) 50vw, 100vw",
  },
];

export default function AboutPage() {
  return (
    <>
      <article className="mx-auto max-w-2xl px-6 pt-16 pb-8 text-foreground">
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
      </article>

      <section
        aria-label="Coaching moments"
        className="mx-auto max-w-5xl px-6 pb-20"
      >
        <div className="grid grid-cols-2 gap-2 auto-rows-[140px] md:grid-cols-4 md:auto-rows-[180px]">
          {montage.map((item) => (
            <div
              key={item.src}
              className={`relative overflow-hidden rounded-lg bg-surface-2 ${item.className}`}
            >
              <Image
                src={item.src}
                alt={item.alt}
                fill
                sizes={item.sizes}
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
