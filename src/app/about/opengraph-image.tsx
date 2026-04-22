import { marketingOgImage, OG_SIZE } from "@/lib/og/marketing";

export const runtime = "nodejs";
export const alt = "About xogridmaker — built by a coach, for coaches";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function AboutOgImage() {
  return marketingOgImage({
    eyebrow: "About",
    headline: "Built by a coach, for coaches.",
    subline: "A football play designer for flag, youth tackle, and 7v7 teams.",
  });
}
