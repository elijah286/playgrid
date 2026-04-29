import { marketingOgImage, OG_SIZE } from "@/lib/og/marketing";

export const runtime = "nodejs";
export const alt = "XO Gridmaker pricing — plans for coaches and teams";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function PricingOgImage() {
  return marketingOgImage({
    eyebrow: "Pricing",
    headline: "Plans that scale with how you coach.",
    subline: "Free to start. Paid tiers grow with more plays, playbooks, and athletes.",
  });
}
