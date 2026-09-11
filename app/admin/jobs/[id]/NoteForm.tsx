"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/forms/Field";
import { saveNote, type FormState } from "../actions";

export function NoteForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveNote.bind(null, jobId), {});
  const formRef = useRef<HTMLFormElement>(null);
  // Clear the textarea by resetting the DOM form after a successful save.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <TextAreaField id="note-body" name="body" label="Add a note" rows={3} />
      {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
      <Button type="submit" variant="outline" disabled={pending} className="self-start">Add note</Button>
    </form>
  );
}
