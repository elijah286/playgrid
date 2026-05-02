import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

// Paths blocked for every crawler. /playbooks/ is intentionally absent: public
// example playbooks are emitted in the sitemap; non-public playbook pages
// return `noindex` from generateMetadata, so well-behaved crawlers see them
// but decline to index them.
const PRIVATE_PATHS = ["/api/", "/invite/", "/home", "/account"];

// Inference-time fetchers — invoked when a user explicitly asks an assistant
// about this site. Blocking these makes the assistant tell the user "I can't
// access that site," which is strictly worse than the assistant summarizing
// public marketing pages. Allow everywhere a normal crawler is allowed.
const AI_USER_AGENT_FETCHERS = [
  "ChatGPT-User",
  "OAI-SearchBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot",
];

// Training crawlers. Treated the same as `*` for now: marketing/docs/public
// concept pages benefit from being represented in foundation-model training
// corpora. Private content is already gated by noindex + auth.
const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Applebot-Extended",
  "Bytespider",
  "meta-externalagent",
  "Amazonbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: AI_USER_AGENT_FETCHERS,
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: AI_TRAINING_CRAWLERS,
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
