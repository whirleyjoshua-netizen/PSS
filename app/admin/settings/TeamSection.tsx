import { Button } from "@/components/ui/Button";
import type { TeamMember } from "@/lib/admin/team";
import { roleLabel } from "@/lib/admin/team-roles";
import { removeMember } from "./actions";
import { AddMemberForm } from "./AddMemberForm";

/** The people jobs can be assigned to. Names only, never sign-ins. */
export function TeamSection({ team }: { team: TeamMember[] }) {
  return (
    <section aria-labelledby="team-heading" className="flex flex-col gap-3">
      <h2 id="team-heading" className="text-lg font-semibold">
        Team
      </h2>
      {team.length ? (
        <ul className="flex flex-col divide-y divide-rule border border-rule bg-ivory">
          {team.map((person) => (
            <li key={person.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span>
                {person.name} — {roleLabel(person.role)}
              </span>
              <form action={removeMember.bind(null, person.id)}>
                <Button type="submit" variant="outline" aria-label={`Remove ${person.name}`}>
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft">No one added yet.</p>
      )}
      <p className="text-sm text-ink-soft">Removing someone leaves their jobs unassigned.</p>
      <AddMemberForm />
    </section>
  );
}
