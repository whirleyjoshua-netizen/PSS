import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PSS Jobs",
  robots: { index: false, follow: false },
};

/** Owner-only area. Deliberately plain: it is a tool, not a page to market. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex-1 bg-ivory px-4 py-6 text-charcoal sm:px-6">{children}</main>;
}
