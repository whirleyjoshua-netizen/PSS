import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your project | Premier Shade Solutions",
  robots: { index: false, follow: false },
};

/** Customer area. Every page calls requireCustomer() itself. */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  // Wide enough for the project page's tracker and two-column details. The sign-in and
  // auth pages inside this area set their own narrow max-width, so they are unaffected.
  return <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">{children}</div>;
}
