import type { Metadata } from "next";
import { getAdmin } from "@/lib/admin/session";
import { AdminNav } from "./AdminNav";

export const metadata: Metadata = {
  title: "PSS Jobs",
  robots: { index: false, follow: false },
};

/**
 * Owner-only area. Deliberately plain: it is a tool, not a page to market.
 * Signed-in pages get the left column; sign-in and the link confirm page do not.
 * Each page still calls requireAdmin() itself — this lookup only picks the chrome.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();

  if (!admin) {
    return <main className="admin-theme flex-1 px-4 py-6 sm:px-6">{children}</main>;
  }

  return (
    <div className="admin-theme flex min-h-screen flex-1 flex-col md:flex-row">
      <AdminNav email={admin.email} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
