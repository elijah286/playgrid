import type { Metadata } from "next";
import { getSharedPlayByTokenAction } from "@/app/actions/share";
import { pathGeometryToSvgD, routeToPathGeometry } from "@/domain/play/geometry";
import { resolveRouteStroke } from "@/domain/play/factory";
import { Badge } from "@/components/ui";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const res = await getSharedPlayByTokenAction(token);

  if (!res.ok) {
    return {
      title: "Shared play",
      description: "This shared play link is no longer available.",
      robots: { index: false, follow: false },
    };
  }

  const m = res.document.metadata;
  const name = m.coachName || "Shared play";
  const parts = [m.formationTag || m.formation, m.concept].filter(Boolean);
  const subtitle = parts.join(" · ");
  const description = subtitle
    ? `${subtitle} — shared from XO Gridmaker.`
    : "A football play shared from XO Gridmaker.";
  const canonical = `/v/${token}`;

  return {
    title: `${name} — shared play`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${name} — shared play`,
      description,
      url: canonical,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} — shared play`,
      description,
    },
  };
}

export default async function SharedPlayPage({ params }: Props) {
  const { token } = await params;
  const res = await getSharedPlayByTokenAction(token);

  if (!res.ok) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-muted">{res.error}</p>
      </div>
    );
  }

  const doc = res.document;

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Shared play</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
          {doc.metadata.coachName}
        </h1>
        {doc.metadata.wristbandCode && (
          <Badge variant="primary" className="mt-2">{doc.metadata.wristbandCode}</Badge>
        )}
      </div>
      <div className="aspect-[4/3] w-full overflow-hidden rounded-xl shadow-card">
        <svg viewBox="0 0 1 1" className="h-full w-full">
          <defs>
            <linearGradient id="sharedFieldGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2D8B4E" />
              <stop offset="100%" stopColor="#247540" />
            </linearGradient>
          </defs>
          <rect width={1} height={1} fill="url(#sharedFieldGrad)" />
          {doc.layers.routes.map((r) => (
            <path
              key={r.id}
              d={pathGeometryToSvgD(routeToPathGeometry(r))}
              fill="none"
              stroke={resolveRouteStroke(r, doc.layers.players)}
              strokeWidth={0.004}
            />
          ))}
          {doc.layers.players.map((pl) => (
            <g key={pl.id}>
              <circle
                cx={pl.position.x}
                cy={1 - pl.position.y}
                r={0.03}
                fill="#FFFFFF"
                stroke="rgba(0,0,0,0.2)"
                strokeWidth={0.003}
              />
              <text
                x={pl.position.x}
                y={1 - pl.position.y + 0.01}
                textAnchor="middle"
                fontSize={0.022}
                fontWeight={700}
                fill="#1C1C1E"
                style={{ fontFamily: "Inter, system-ui, sans-serif" }}
              >
                {pl.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
