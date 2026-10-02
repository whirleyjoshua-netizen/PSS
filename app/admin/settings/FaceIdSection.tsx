import { Button } from "@/components/ui/Button";
import type { PasskeyDevice } from "@/lib/admin/passkeys";
import { formatDay } from "@/lib/admin/time";
import { removeFaceIdDevice } from "../passkey-actions";
import { TurnOnFaceId } from "../TurnOnFaceId";

/** The signed-in person's own Face ID devices. Nobody sees or removes anyone else's here. */
export function FaceIdSection({ devices }: { devices: PasskeyDevice[] }) {
  return (
    <section aria-labelledby="face-id-heading" className="flex flex-col gap-3">
      <h2 id="face-id-heading" className="text-lg font-semibold">
        Face ID sign-in
      </h2>
      {devices.length ? (
        <ul className="flex flex-col divide-y divide-rule border border-rule bg-ivory">
          {devices.map((device) => {
            const added = formatDay(device.createdAt);
            return (
              <li key={device.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span>
                  {device.label}
                  <span className="block text-ink-soft">
                    Added {added} · {device.lastUsedAt ? `last used ${formatDay(device.lastUsedAt)}` : "never used"}
                  </span>
                </span>
                <form action={removeFaceIdDevice.bind(null, device.id)}>
                  <Button type="submit" variant="outline" aria-label={`Remove ${device.label} added ${added}`}>
                    Remove
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">No devices yet. Turn it on from the phone you sign in with.</p>
      )}
      <TurnOnFaceId place="settings" />
    </section>
  );
}
