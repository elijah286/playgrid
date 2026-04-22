import { marketingOgImage, OG_SIZE } from "@/lib/og/marketing";

export const runtime = "nodejs";
export const alt = "xogridmaker FAQ — answers for coaches";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function FaqOgImage() {
  return marketingOgImage({
    eyebrow: "FAQ",
    headline: "Answers for coaches kicking the tires.",
    subline: "What xogridmaker is, who it's for, and how sharing works.",
  });
}
