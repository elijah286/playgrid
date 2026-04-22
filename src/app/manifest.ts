import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PlayGrid — Football play designer for coaches",
    short_name: "PlayGrid",
    description:
      "Design football plays, organize them into playbooks, preview wristbands, and carry your playbook to the field.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#2563eb",
    categories: ["sports", "productivity", "education"],
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
