import { ImageResponse } from "next/og";
import { business } from "@/content/business";

export const alt = "Premier Shade Solutions — You let us into your home. We let you into our family.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Hex literals rather than tokens: next/og renders outside the app's CSS, so
 * custom properties are unavailable here. Values match app/globals.css.
 */
const CHARCOAL = "#1E1E1E";
const CHAMPAGNE = "#CDB891";
const IVORY = "#F7F5F0";
const TAUPE = "#7A7263";
const SAND = "#E7E1D6";

export default function OpenGraphImage() {
  const panels = [
    { height: 300, color: IVORY },
    { height: 246, color: "#B3AAA0" },
    { height: 192, color: CHAMPAGNE },
    { height: 138, color: TAUPE },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: CHARCOAL,
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          {panels.map((panel) => (
            <div
              key={panel.height}
              style={{ width: 46, height: panel.height, background: panel.color }}
            />
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 26,
              letterSpacing: 10,
              color: CHAMPAGNE,
              textTransform: "uppercase",
            }}
          >
            Premier Shade Solutions
          </div>
          <div style={{ fontSize: 68, color: IVORY, letterSpacing: -1 }}>
            {business.tagline}
          </div>
          <div style={{ fontSize: 26, color: SAND, opacity: 0.75 }}>
            Custom blinds, shades &amp; shutters · Las Vegas, NV
          </div>
        </div>
      </div>
    ),
    size,
  );
}
