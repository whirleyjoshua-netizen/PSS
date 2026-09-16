"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { TeamMember } from "@/lib/admin/team";
import { roleLabel } from "@/lib/admin/team-roles";
import { SubmitOnChange } from "../../SubmitOnChange";
import { assignJobAction, type FormState } from "../actions";

/** One person per job. Saves as soon as the choice changes; Save covers no-JS. */
export function AssignControl({ jobId, assignedTo, team }: {
  jobId: string;
  assignedTo: string | null;
  team: TeamMember[];
}) {
  const [state, action] = useActionState<FormState, FormData>(assignJobAction.bind(null, jobId), {});
  if (!team.length) {
    return <Link href="/admin/settings" className="text-sm underline underline-offset-4">Add people in Settings</Link>;
  }
  const id = `assign-${jobId}`;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor={id} className="text-ink-soft">Assigned to</label>
      {/* Remount on every save so the select shows the server's answer: the new
          person after a success, the unchanged one after a failed attempt. */}
      <SubmitOnChange
        key={`${assignedTo ?? "none"}:${state.error ?? ""}`}
        id={id}
        name="assignedTo"
        defaultValue={assignedTo ?? ""}
      >
        <option value="">Unassigned</option>
        {team.map((person) => (
          <option key={person.id} value={person.id}>{person.name} — {roleLabel(person.role)}</option>
        ))}
      </SubmitOnChange>
      <button type="submit" className="sr-only">Save</button>
      {state.error ? <p role="alert" className="w-full text-overdue">{state.error}</p> : null}
    </form>
  );
}
