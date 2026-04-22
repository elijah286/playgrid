import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

const BRAND_BLUE = "#1769FF";
const BRAND_GREEN = "#95CC1F";
const BRAND_ORANGE = "#FF7A00";
const BRAND_NAVY = "#0F1E3D";

export default async function HomePage() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/home");
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-white">
      {/* Grid backdrop — echoes the logo's play-diagram grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #D6DAE0 1px, transparent 1px), linear-gradient(to bottom, #D6DAE0 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 90% 70% at 50% 40%, #000 50%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 70% at 50% 40%, #000 50%, transparent 100%)",
        }}
      />

      {/* Soft color bloom accents */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-20 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{ background: `${BRAND_BLUE}18` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-40 h-[24rem] w-[24rem] rounded-full blur-3xl"
        style={{ background: `${BRAND_GREEN}20` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/3 h-[20rem] w-[20rem] rounded-full blur-3xl"
        style={{ background: `${BRAND_ORANGE}12` }}
      />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col justify-center gap-12 px-6 py-20 md:flex-row md:items-center md:gap-12 lg:gap-20">
        {/* Left: headline + CTAs */}
        <div className="flex-1">
          <div
            className="mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider"
            style={{
              borderColor: `${BRAND_BLUE}33`,
              background: `${BRAND_BLUE}0D`,
              color: BRAND_BLUE,
            }}
          >
            <span
              className="inline-block size-1.5 rounded-full"
              style={{ background: BRAND_GREEN }}
            />
            Football play designer for coaches
          </div>

          <h1
            className="text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl"
            style={{ color: BRAND_NAVY }}
          >
            Design plays.
            <br />
            <span style={{ color: BRAND_GREEN }}>Win games.</span>
          </h1>

          <p
            className="mt-8 max-w-xl text-lg leading-relaxed"
            style={{ color: "#475569" }}
          >
            Draw plays on a real grid, organize them into playbooks, preview
            wristbands, and carry your playbook to the field. Built for flag
            football, 7v7, and tackle coaches who take their game seriously.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3.5 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ background: BRAND_BLUE }}
            >
              Get started
              <ArrowRight className="size-5" />
            </Link>
            <Link
              href="/examples"
              className="inline-flex items-center gap-2 rounded-lg border-2 px-6 py-3 text-base font-semibold transition-colors"
              style={{
                borderColor: `${BRAND_NAVY}1A`,
                color: BRAND_NAVY,
              }}
            >
              See example playbooks
            </Link>
          </div>

          {/* Variant badges — each reinforces a brand color */}
          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-semibold">
            <span style={{ color: "#64748B" }}>Built for</span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1"
              style={{ background: `${BRAND_BLUE}14`, color: BRAND_BLUE }}
            >
              <span className="font-black">✕</span> Flag football
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1"
              style={{ background: `${BRAND_GREEN}1F`, color: "#5B8A00" }}
            >
              <span className="font-black">○</span> 7v7
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1"
              style={{ background: `${BRAND_ORANGE}1A`, color: "#C85A00" }}
            >
              <span className="font-black">↗</span> Tackle
            </span>
          </div>
        </div>

        {/* Right: the logo as a hero visual */}
        <div className="flex flex-1 items-center justify-center">
          <Image
            src="/brand/xogridmaker_icon.svg"
            alt="xogridmaker"
            width={900}
            height={660}
            priority
            className="h-auto w-full max-w-[640px] drop-shadow-[0_30px_60px_rgba(23,105,255,0.18)]"
          />
        </div>
      </div>
    </div>
  );
}
