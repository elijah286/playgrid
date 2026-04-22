import { marketingOgImage, OG_SIZE } from "@/lib/og/marketing";

export const runtime = "nodejs";
export const alt = "Example football playbooks built in xogridmaker";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function ExamplesOgImage() {
  return marketingOgImage({
    eyebrow: "Example playbooks",
    headline: "Real playbooks. Real plays.",
    subline: "Browse playbooks coaches have built in xogridmaker, then create your own free.",
  });
}
