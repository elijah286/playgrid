import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "xogridmaker — Football play designer for coaches";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background:
            "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0b2540 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          <svg width="72" height="30" viewBox="0 0 900 380" xmlns="http://www.w3.org/2000/svg">
            <line stroke="#1769FF" strokeLinecap="square" strokeWidth="52" x1="250" x2="380" y1="100" y2="240" />
            <line stroke="#1769FF" strokeLinecap="square" strokeWidth="52" x1="380" x2="250" y1="100" y2="240" />
            <rect fill="none" height="130" rx="42" ry="42" stroke="#95CC1F" strokeWidth="38" width="170" x="480" y="105" />
          </svg>
          xogridmaker
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 92,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
            }}
          >
            Design plays.
            <br />
            <span style={{ color: "#95CC1F" }}>Win games.</span>
          </div>
          <div
            style={{
              fontSize: 30,
              color: "rgba(255,255,255,0.72)",
              maxWidth: 900,
              lineHeight: 1.3,
            }}
          >
            Football play designer for coaches — build playbooks, preview
            wristbands, and carry them to the field.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          <span>xogridmaker.com</span>
          <span>Built for gameday</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
