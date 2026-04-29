import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /playbooks/ is intentionally crawlable: public example playbooks
        // are emitted in the sitemap. Non-public playbook pages return
        // `noindex` from generateMetadata, so Googlebot sees them but
        // declines to index them.
        disallow: ["/api/", "/invite/", "/home", "/account"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
