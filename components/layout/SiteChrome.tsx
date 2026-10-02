import { Header } from "@/components/layout/Header";
import { PromoBanner } from "@/components/layout/PromoBanner";
import { Footer } from "@/components/layout/Footer";
import { JsonLd } from "@/components/seo/JsonLd";
import { localBusinessSchema } from "@/lib/seo/schema";
import { AttributionCapture } from "@/components/analytics/AttributionCapture";
import { PhoneClickTracking } from "@/components/analytics/PhoneClickTracking";

/** Chrome for every public page, including the 404 page. The admin area supplies its own. */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-charcoal focus:px-4 focus:py-2 focus:text-ivory"
      >
        Skip to content
      </a>
      <PromoBanner />
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <JsonLd schema={localBusinessSchema()} />
      <AttributionCapture />
      <PhoneClickTracking />
    </>
  );
}
