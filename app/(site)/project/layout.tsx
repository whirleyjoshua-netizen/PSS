import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your project | Premier Shade Solutions",
  robots: { index: false, follow: false },
};

/** Customer area. Every page calls requireCustomer() itself. */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">{children}</div>;
}
