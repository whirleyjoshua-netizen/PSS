import type { Metadata } from "next";
import { Jost, Source_Serif_4 } from "next/font/google";
import { SiteAnalytics } from "@/components/analytics/SiteAnalytics";
import "./globals.css";
import { business } from "@/content/business";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo/site";

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(business.domain),
  title: {
    default: SITE_TITLE,
    template: "%s",
  },
  description: SITE_DESCRIPTION,
  applicationName: business.name,
  authors: [{ name: business.name }],
  // No url: a page that inherits this would claim the homepage's address. Indexable pages set their own
  // openGraph (lib/seo/metadata.ts, or the homepage's in app/(site)/page.tsx).
  openGraph: {
    siteName: business.name,
    locale: "en_US",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jost.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
      {/* Public site only: skips and switches off GA on /admin and /project. */}
      <SiteAnalytics />
    </html>
  );
}
