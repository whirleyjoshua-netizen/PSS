import { Button } from "@/components/ui/Button";
import type { AddedAdmin } from "@/lib/admin/admin-access";
import { formatDay } from "@/lib/admin/time";
import { removeAccess } from "./actions";
import { GiveAccessForm } from "./GiveAccessForm";

/** Who can sign in. Owners come from ADMIN_EMAILS and are never removable here. */
export function AdminAccessSection({ owners, added, me }: { owners: string[]; added: AddedAdmin[]; me: string }) {
  const self = me.trim().toLowerCase();
  // An owner who also has a row (added, then made an owner) shows once, as Owner: Remove would do nothing.
  // Normalized and deduped, so a repeated ADMIN_EMAILS entry shows once.
  const ownerList = [...new Set(owners.map((email) => email.trim().toLowerCase()))];
  const ownerSet = new Set(ownerList);
  const others = added.filter((person) => !ownerSet.has(person.email.trim().toLowerCase()));
  return (
    <section aria-labelledby="access-heading" className="flex flex-col gap-3">
      <h2 id="access-heading" className="text-lg font-semibold">
        Admin access
      </h2>
      <ul className="flex flex-col divide-y divide-rule border border-rule bg-ivory">
        {ownerList.map((email) => (
          <li key={email} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span>{email}</span>
            <span className="text-ink-soft">Owner</span>
          </li>
        ))}
        {others.map((person) => (
          <li key={person.email} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span>
              {person.email}
              <span className="block text-ink-soft">
                added by {person.addedBy} on {formatDay(person.addedAt)}
              </span>
            </span>
            {person.email === self ? (
              <span className="text-ink-soft">That&apos;s you</span>
            ) : (
              <form action={removeAccess.bind(null, person.email)}>
                <Button type="submit" variant="outline" aria-label={`Remove ${person.email}`}>
                  Remove
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-soft">
        Anyone here can use the whole admin, including this list. Removing someone signs them out right away.
      </p>
      <GiveAccessForm added={added.map((person) => person.email)} />
    </section>
  );
}
