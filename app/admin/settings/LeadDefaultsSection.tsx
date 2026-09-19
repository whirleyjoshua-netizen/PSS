"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/forms/Field";
import type { TeamMember } from "@/lib/admin/team";
import { roleLabel } from "@/lib/admin/team-roles";
import { saveLeadDefaultsAction, type LeadDefaultsState } from "./actions";

const CONTROL = "min-h-11 w-full border border-rule bg-ivory px-4 py-3";

/** Who every new lead is assigned to, from the website form or added by hand. A plain form, so it saves without JavaScript. */
export function LeadDefaultsSection({ team, defaultAssignee }: { team: TeamMember[]; defaultAssignee: string | null }) {
  const [state, action, saving] = useActionState<LeadDefaultsState, FormData>(saveLeadDefaultsAction, {});

  return (
    <section aria-labelledby="lead-defaults-heading" className="flex flex-col gap-3">
      <h2 id="lead-defaults-heading" className="text-lg font-semibold">
        New leads
      </h2>
      <form action={action} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="lead-default-assignee">Default for new leads</Label>
          <select
            id="lead-default-assignee"
            name="defaultAssignee"
            defaultValue={defaultAssignee ?? ""}
            className={CONTROL}
          >
            <option value="">Nobody</option>
            {team.map((person) => (
              <option key={person.id} value={person.id}>
                {`${person.name} — ${roleLabel(person.role)}`}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm text-ink-soft">Jobs that already exist keep who they are assigned to.</p>
        <div>
          <Button type="submit" disabled={saving}>
            Save default
          </Button>
        </div>
        {state.ok ? (
          <p role="status" className="text-sm text-ink-soft">
            Saved.
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-sm text-overdue">
            {state.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
