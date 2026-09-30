"use client";

import { useState, useSyncExternalStore } from "react";
import { INITIALS_INPUT_PATTERN, INITIALS_MAX, INITIALS_PAD, SIGNATURE_PAD } from "@/lib/portal/adoption-limits";
import { TYPED_NAME_MAX } from "@/lib/portal/typed-name";
import { handFont } from "./hand-font";
import { SignaturePad } from "./SignaturePad";

// False on the server and before hydration, true in a hydrated browser (the FilesTabs.tsx pattern).
const subscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(subscribe, () => true, () => false);

/**
 * Adopting a signature (spec §4): Type (the default) or Draw. Typing works as a plain form post with
 * JavaScript off. The switch, the live preview and the pads appear only once hydrated, so the
 * server-rendered form is exactly the typed one. The full name is always typed: it is the printed
 * name and the record.
 */
export function AdoptSignature({ needsInitials }: { needsInitials: boolean }) {
  const hydrated = useHydrated();
  const [method, setMethod] = useState<"typed" | "drawn">("typed");
  const [name, setName] = useState("");
  const [initials, setInitials] = useState("");
  const [signatureImage, setSignatureImage] = useState("");
  const [initialsImage, setInitialsImage] = useState("");
  const drawn = hydrated && method === "drawn";
  const tab = (active: boolean) =>
    `min-h-11 flex-1 border border-charcoal px-4 font-display text-xs uppercase tracking-[0.2em] ${active ? "bg-charcoal text-ivory" : "text-charcoal"}`;

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold">Adopt your signature</legend>
      <input type="hidden" name="signatureMethod" value={drawn ? "drawn" : "typed"} />
      {hydrated ? (
        <div role="group" aria-label="How you sign" className="flex">
          <button type="button" aria-pressed={!drawn} onClick={() => setMethod("typed")} className={tab(!drawn)}>Type</button>
          <button type="button" aria-pressed={drawn} onClick={() => setMethod("drawn")} className={tab(drawn)}>Draw</button>
        </div>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        Your full name
        <input
          type="text"
          name="signedName"
          required
          maxLength={TYPED_NAME_MAX}
          // `required` alone lets a name of only spaces through, which the action then refuses.
          pattern=".*\S.*"
          title="Type your full name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 w-full border border-rule bg-ivory px-3"
        />
      </label>
      {!drawn && needsInitials ? (
        <label className="flex flex-col gap-1 text-sm">
          Your initials
          <input
            type="text"
            name="signedInitials"
            required
            maxLength={INITIALS_MAX}
            pattern={INITIALS_INPUT_PATTERN}
            title="1 to 6 letters, starting with a letter"
            autoComplete="off"
            value={initials}
            onChange={(event) => setInitials(event.target.value)}
            className="min-h-11 w-28 border border-rule bg-ivory px-3"
          />
        </label>
      ) : null}
      {!drawn && hydrated ? (
        <div data-testid="signature-preview" aria-hidden="true" className="flex flex-wrap items-end gap-6 border-b border-rule pb-1">
          <span className={`${handFont.className} text-3xl`}>{name.trim() || "Your name"}</span>
          {needsInitials ? <span className={`${handFont.className} text-2xl`}>{initials.trim() || "Initials"}</span> : null}
        </div>
      ) : null}
      {drawn ? (
        <>
          <SignaturePad name="signatureImage" label="Signature" maxWidth={SIGNATURE_PAD.maxWidth} maxHeight={SIGNATURE_PAD.maxHeight}
            value={signatureImage} onChange={setSignatureImage} />
          {needsInitials ? (
            <SignaturePad name="initialsImage" label="Initials" maxWidth={INITIALS_PAD.maxWidth} maxHeight={INITIALS_PAD.maxHeight}
              value={initialsImage} onChange={setInitialsImage} />
          ) : null}
        </>
      ) : null}
    </fieldset>
  );
}
