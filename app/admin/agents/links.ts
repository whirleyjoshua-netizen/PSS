/** The one Agents page and its URL state: the selected agent, the item in the reading pane, and the report type filter. */
export function agentsHref(state: { agent?: string; item?: string; type?: string }): string {
  const query = new URLSearchParams();
  if (state.agent) query.set("agent", state.agent);
  if (state.item) query.set("item", state.item);
  if (state.type) query.set("type", state.type);
  const text = query.toString();
  return text ? `/admin/agents?${text}` : "/admin/agents";
}
