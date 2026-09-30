import localFont from "next/font/local";

/** The handwriting font the signed PDF draws with (lib/pdf/fonts), so the preview shows what will be stamped (spec §7). */
export const handFont = localFont({ src: "../../../lib/pdf/fonts/GreatVibes-Regular.ttf", display: "swap" });
