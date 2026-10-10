import { Great_Vibes, Playfair_Display } from "next/font/google";

/**
 * The holiday page's own type (owner 2026-10-10: "go all out with font change"): a festive high-contrast serif for
 * the big words and a script for the flourishes. Loaded here, not in the root layout, so only /holiday pays for them.
 */
export const holidayDisplay = Playfair_Display({
  variable: "--font-holiday-display",
  subsets: ["latin"],
  weight: ["700", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

export const holidayScript = Great_Vibes({
  variable: "--font-holiday-script",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const holidayFonts = `${holidayDisplay.variable} ${holidayScript.variable}`;
