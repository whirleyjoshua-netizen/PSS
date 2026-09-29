"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/session";
import { isDocResponse, isSingletonKind, isTemplateKind } from "@/lib/docs/kinds";
import { STARTER_TERMS, STARTER_TERMS_NAME } from "@/lib/docs/starter-terms";
import { archiveTemplate, createTemplate, getTemplate, updateTemplate } from "@/lib/docs/templates";
import { templateErrors } from "@/lib/docs/validate";

export type TemplateFormState = { errors?: string[]; saved?: boolean };

const str = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");
const ARCHIVED = "This template was archived. Reload the page.";
// Settings shows whether contracts use the terms template, so it goes stale too.
const refresh = () => {
  revalidatePath("/admin/documents");
  revalidatePath("/admin/settings");
};

// Each action calls requireAdmin() before reading its input.
export async function createTemplateAction(_previous: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  const admin = await requireAdmin();
  const kind = str(formData.get("kind"));
  const input = {
    name: str(formData.get("name")),
    kind,
    // Terms and guides are view only; the form disables the choice, and this is the guard.
    response: isSingletonKind(kind) ? "view" : str(formData.get("response")),
    body: str(formData.get("body")),
  };
  const errors = templateErrors(input);
  if (errors.length > 0 || !isTemplateKind(input.kind) || !isDocResponse(input.response)) return { errors };
  const created = await createTemplate({ name: input.name, kind: input.kind, response: input.response, body: input.body, actor: admin.email });
  if ("error" in created) return { errors: [created.error] };
  refresh();
  redirect(`/admin/documents/${created.id}`);
}

/** The kind comes from the stored template, never the form: a template's kind never changes. */
export async function saveTemplateAction(_previous: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  const admin = await requireAdmin();
  const id = str(formData.get("id"));
  const template = await getTemplate(id);
  if (!template || template.archivedAt) return { errors: [ARCHIVED] };
  const input = {
    name: str(formData.get("name")),
    kind: template.kind,
    response: isSingletonKind(template.kind) ? "view" : str(formData.get("response")),
    body: str(formData.get("body")),
  };
  const errors = templateErrors(input);
  if (errors.length > 0 || !isDocResponse(input.response)) return { errors };
  if (!(await updateTemplate({ id, name: input.name, response: input.response, body: input.body, actor: admin.email }))) {
    return { errors: [ARCHIVED] };
  }
  refresh();
  return { saved: true };
}

export async function archiveTemplateAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  await archiveTemplate(str(formData.get("id")), admin.email);
  refresh();
  redirect("/admin/documents");
}

/** Spec §5: offered only while there is no terms template. The unique index refuses a second one. */
export async function startStarterTermsAction(): Promise<void> {
  const admin = await requireAdmin();
  const created = await createTemplate({ name: STARTER_TERMS_NAME, kind: "terms", response: "view", body: STARTER_TERMS, actor: admin.email });
  refresh();
  redirect("id" in created ? `/admin/documents/${created.id}` : "/admin/documents?starter=exists");
}
