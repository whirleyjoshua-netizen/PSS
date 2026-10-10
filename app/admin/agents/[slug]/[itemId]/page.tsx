import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/session";
import { agentsHref } from "../../links";

export const dynamic = "force-dynamic";

/** The old item page. Old links and bookmarks open the item in the Agents page's reading pane. */
export default async function AgentItemPage({ params }: { params: Promise<{ slug: string; itemId: string }> }) {
  await requireAdmin();
  const { slug, itemId } = await params;
  redirect(agentsHref({ agent: slug, item: itemId }));
}
