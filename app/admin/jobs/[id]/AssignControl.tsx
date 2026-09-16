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
      {/* React already restores the select to the server value after the action
          settles; this key makes that reset explicit rather than incidental (and
          guards a future change to SubmitOnChange). No test can fail if the
          state.error term is removed. */}
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
      {/* Named for what it saves: ContactLog has its own "Save" on this page, and two buttons
          with the same accessible name leave a screen-reader user guessing. */}
      <button type="submit" className="sr-only">Save assignee</button>
      {state.error ? <p role="alert" className="w-full text-overdue">{state.error}</p> : null}
    </form>
  );
}
