const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

const PRIVATE_PATHS = ["/api/", "/invite/", "/home", "/account"];

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

const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Applebot-Extended",
  "Bytespider",
  "meta-externalagent",
  "Amazonbot",
];

const CONTENT_SIGNAL = "Content-Signal: search=yes, ai-train=yes, ai-input=yes";

function block(userAgents: string[]): string {
  const lines: string[] = [];
  for (const ua of userAgents) lines.push(`User-agent: ${ua}`);
  lines.push(CONTENT_SIGNAL);
  lines.push("Allow: /");
  for (const path of PRIVATE_PATHS) lines.push(`Disallow: ${path}`);
  return lines.join("\n");
}

export function GET(): Response {
  const body = [
    block(["*"]),
    "",
    block(AI_USER_AGENT_FETCHERS),
    "",
    block(AI_TRAINING_CRAWLERS),
    "",
    `Host: ${SITE_URL}`,
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
