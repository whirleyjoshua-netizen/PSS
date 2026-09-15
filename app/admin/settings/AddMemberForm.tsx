"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import { TEAM_ROLES } from "@/lib/admin/team-roles";
import { addMember, type TeamFormState } from "./actions";

export function AddMemberForm() {
  const [state, action, adding] = useActionState<TeamFormState, FormData>(addMember, {});

  return (
    <form
      // Remount with a fresh key so a rejected name comes back as the new default,
      // and a successful add drops back to the empty default instead of lingering.
      key={state.name ?? "form"}
      action={action}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex min-w-40 flex-1 flex-col gap-2">
        <Label htmlFor="team-name">Name</Label>
        <input
          id="team-name"
          name="name"
          defaultValue={state.name ?? ""}
          maxLength={60}
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "team-name-error" : undefined}
          className={CONTROL}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="team-role">Role</Label>
        <select id="team-role" name="role" defaultValue="designer" className={CONTROL}>
          {TEAM_ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline" disabled={adding}>
        Add
      </Button>
      {state.error ? (
        <p id="team-name-error" role="alert" className="w-full text-sm text-overdue">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
