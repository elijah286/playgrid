import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        <svg
          width="140"
          height="60"
          viewBox="0 0 900 380"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g>
            <line
              stroke="#1769FF"
              strokeLinecap="square"
              strokeWidth="52"
              x1="250"
              x2="380"
              y1="100"
              y2="240"
            />
            <line
              stroke="#1769FF"
              strokeLinecap="square"
              strokeWidth="52"
              x1="380"
              x2="250"
              y1="100"
              y2="240"
            />
            <rect
              fill="none"
              height="130"
              rx="42"
              ry="42"
              stroke="#95CC1F"
              strokeWidth="38"
              width="170"
              x="480"
              y="105"
            />
          </g>
        </svg>
      </div>
    ),
    { ...size },
  );
}
