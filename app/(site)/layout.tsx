import { SiteChrome } from "@/components/layout/SiteChrome";

/** Chrome for every public page. The admin area supplies its own. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
