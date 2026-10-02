import type { Metadata, Viewport } from "next";
import { getAdmin } from "@/lib/admin/session";
import { AdminNav } from "./AdminNav";
import { RegisterOpsWorker } from "./RegisterOpsWorker";

export const metadata: Metadata = {
  title: "PSS Jobs",
  robots: { index: false, follow: false },
  // Only admin pages link the manifest, so "Add to Home Screen" from the public site isn't PSS Ops.
  manifest: "/ops.webmanifest",
  appleWebApp: { capable: true, title: "PSS Ops", statusBarStyle: "black-translucent" },
  icons: { apple: "/ops/icon-180.png" },
};

/** Draw under the notch and home indicator; the safe-area padding below keeps content clear of them. */
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#1E1E1E" };

/**
 * Owner-only area. Uses the Premier Shade Solutions brand palette and logo, with a
 * dark sidebar and warm ground — the owners' own tool, not a page to market.
 * Signed-in pages get the left column; sign-in and the link confirm page do not.
 * Each page still calls requireAdmin() itself — this lookup only picks the chrome.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();

  if (!admin) {
    return (
      <main className="admin-theme flex-1 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 sm:px-6">
        <RegisterOpsWorker />
        {children}
      </main>
    );
  }

  return (
    <div className="admin-theme flex min-h-screen flex-1 flex-col md:flex-row">
      <AdminNav email={admin.email} />
      <RegisterOpsWorker />
      <main className="min-w-0 flex-1 px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8">{children}</main>
    </div>
  );
}
