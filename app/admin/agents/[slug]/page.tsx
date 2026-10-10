import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/session";
import { agentsHref } from "../links";

export const dynamic = "force-dynamic";

/** The old per-agent page. Agents now live on one page, so old links and bookmarks land there with the agent selected. */
export default async function AgentPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const { type } = await searchParams;
  redirect(agentsHref({ agent: slug, type: typeof type === "string" ? type : undefined }));
}
