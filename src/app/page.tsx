import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

const BRAND_BLUE = "#1769FF";
const BRAND_GREEN = "#95CC1F";
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
    <div className="relative overflow-hidden">
      <div className="relative mx-auto flex min-h-[calc(100dvh-8rem)] max-w-6xl flex-col items-center gap-10 px-6 py-16 md:flex-row md:items-center md:gap-12 lg:gap-16">
        {/* Left: headline + CTAs */}
        <div className="flex-1">
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
            Create custom playbooks and share them with your team. Quickly
            generate game-ready wristbands and play sheets. Designed for flag,
            7v7, and tackle football coaches.
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
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3.5 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ background: BRAND_NAVY }}
            >
              See example playbooks
            </Link>
          </div>
        </div>

        {/* Right: the logo as a hero visual — smaller than viewport so it sits
            beside the copy on md+ instead of dropping below the fold. */}
        <div className="flex w-full shrink-0 items-center justify-center md:w-[420px] lg:w-[460px]">
          <Image
            src="/brand/xogridmaker_icon.svg"
            alt="xogridmaker"
            width={850}
            height={620}
            priority
            className="h-auto w-full max-w-[320px] md:max-w-none drop-shadow-[0_20px_45px_rgba(23,105,255,0.18)]"
          />
        </div>
      </div>
    </div>
  );
}
