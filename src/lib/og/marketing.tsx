import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

type MarketingOgOptions = {
  eyebrow: string;
  headline: string;
  subline?: string;
};

export function marketingOgImage({
  eyebrow,
  headline,
  subline,
}: MarketingOgOptions) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg,#0b1220 0%,#0f172a 50%,#1e293b 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          padding: "72px",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 12,
            background: "#2D8B4E",
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
          }}
        >
          xogridmaker
        </div>
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 18,
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
            {eyebrow}
          </div>
          <div
            style={{
              fontSize: 84,
              fontWeight: 800,
              lineHeight: 1.03,
              letterSpacing: "-0.025em",
              maxWidth: 1000,
            }}
          >
            {headline}
          </div>
          {subline && (
            <div
              style={{
                fontSize: 30,
                color: "rgba(255,255,255,0.78)",
                maxWidth: 1000,
              }}
            >
              {subline}
            </div>
          )}
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 22,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          xogridmaker.com
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
