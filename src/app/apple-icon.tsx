import { ImageResponse } from "next/og";

// iOS home-screen icon (Next auto-injects the apple-touch-icon link).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BOLT =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 512 512"><path d="M288 136 L168 300 L240 300 L224 384 L344 220 L272 220 Z" fill="#ffffff"/></svg>',
  );

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
          background: "#16a34a",
        }}
      >
        <img src={BOLT} width={96} height={96} alt="" />
      </div>
    ),
    { ...size },
  );
}
