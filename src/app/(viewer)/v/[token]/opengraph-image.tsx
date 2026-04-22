import { ImageResponse } from "next/og";
import { getSharedPlayByTokenAction } from "@/app/actions/share";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const alt = "Shared football play on xogridmaker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ token: string }> };

function fallback() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)",
          color: "white",
          fontSize: 72,
          fontWeight: 800,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "-0.02em",
        }}
      >
        xogridmaker
      </div>
    ),
    { ...size },
  );
}

export default async function SharedPlayOgImage({ params }: Props) {
  const { token } = await params;
  if (!hasSupabaseEnv()) return fallback();

  const res = await getSharedPlayByTokenAction(token);
  if (!res.ok) return fallback();

  const doc = res.document;
  const name = doc.metadata.coachName || "Shared play";
  const wristband = doc.metadata.wristbandCode || "";
  const formationLabel = doc.metadata.formationTag || doc.metadata.formation || "";
  const concept = doc.metadata.concept || "";
  const tagline = [formationLabel, concept].filter(Boolean).join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(160deg,#0b3d21 0%,#2D8B4E 55%,#247540 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          padding: "72px",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 120px)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 26,
            fontWeight: 700,
            color: "rgba(255,255,255,0.85)",
            letterSpacing: "0.02em",
          }}
        >
          xogridmaker
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            marginTop: "auto",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "rgba(255,255,255,0.7)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            Shared play
          </div>
          <div
            style={{
              fontSize: 88,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.025em",
              maxWidth: 1000,
            }}
          >
            {name}
          </div>
          {tagline && (
            <div
              style={{
                fontSize: 34,
                fontWeight: 500,
                color: "rgba(255,255,255,0.82)",
              }}
            >
              {tagline}
            </div>
          )}
        </div>
        <div
          style={{
            marginTop: 40,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          <span>xogridmaker.com</span>
          {wristband && (
            <span
              style={{
                padding: "8px 18px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.16)",
                color: "white",
                fontWeight: 700,
                fontSize: 24,
                letterSpacing: "0.04em",
              }}
            >
              {wristband}
            </span>
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
