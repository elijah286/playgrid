import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563eb",
          color: "white",
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          fontFamily: "system-ui, sans-serif",
          borderRadius: 6,
        }}
      >
        P
      </div>
    ),
    { ...size },
  );
}
