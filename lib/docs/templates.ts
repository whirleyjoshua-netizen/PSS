import "server-only";
import { randomUUID } from "node:crypto";
import { isUuid } from "@/lib/admin/ids";
import { db } from "@/lib/db";
import { isSingletonKind, templateKindLabel, type DocResponse, type SingletonKind, type TemplateKind } from "./kinds";

export type DocumentTemplate = {
  id: string; name: string; kind: TemplateKind; response: DocResponse; body: string;
  archivedAt: Date | null; createdBy: string | null; updatedBy: string | null; createdAt: Date; updatedAt: Date;
};

const date = (value: unknown): Date | null => (value ? new Date(value as string) : null);

const toTemplate = (row: Record<string, unknown>): DocumentTemplate => ({
  id: row.id as string,
  name: row.name as string,
  kind: row.kind as TemplateKind,
  response: row.response as DocResponse,
  body: row.body as string,
  archivedAt: date(row.archived_at),
  createdBy: (row.created_by as string | null) ?? null,
  updatedBy: (row.updated_by as string | null) ?? null,
  createdAt: new Date(row.created_at as string),
  updatedAt: new Date(row.updated_at as string),
});

const UNIQUE_VIOLATION = "23505";

export async function listTemplates(): Promise<DocumentTemplate[]> {
  const rows = await db()`select * from document_templates where archived_at is null order by kind, lower(name)`;
  return rows.map((row) => toTemplate(row as Record<string, unknown>));
}

export async function getTemplate(id: string): Promise<DocumentTemplate | null> {
  if (!isUuid(id)) return null;
  const rows = await db()`select * from document_templates where id = ${id}`;
  return rows[0] ? toTemplate(rows[0] as Record<string, unknown>) : null;
}

export async function liveTemplateOfKind(kind: SingletonKind): Promise<DocumentTemplate | null> {
  const rows = await db()`select * from document_templates where kind = ${kind} and archived_at is null limit 1`;
  return rows[0] ? toTemplate(rows[0] as Record<string, unknown>) : null;
}

/**
 * The unique partial index document_templates_one_live_singleton is what refuses a second live
 * terms or guide template, so two owners racing cannot both succeed. Its violation becomes a
 * plain answer here; every other error still throws.
 */
export async function createTemplate(input: {
  name: string; kind: TemplateKind; response: DocResponse; body: string; actor: string;
}): Promise<{ id: string } | { error: string }> {
  const id = randomUUID();
  const response = isSingletonKind(input.kind) ? "view" : input.response;
  try {
    await db()`
      insert into document_templates (id, name, kind, response, body, created_by, updated_by)
      values (${id}, ${input.name.trim()}, ${input.kind}, ${response}, ${input.body}, ${input.actor}, ${input.actor})`;
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      return { error: `There is already a live ${templateKindLabel(input.kind)} template. Edit that one instead.` };
    }
    throw error;
  }
  return { id };
}

/** Name, response and body of a live template. The kind is fixed at creation. */
export async function updateTemplate(input: {
  id: string; name: string; response: DocResponse; body: string; actor: string;
}): Promise<boolean> {
  if (!isUuid(input.id)) return false;
  const rows = await db()`
    update document_templates
    set name = ${input.name.trim()},
      response = case when kind in ('terms','guide_install','guide_care') then 'view' else ${input.response} end,
      body = ${input.body}, updated_by = ${input.actor}, updated_at = now()
    where id = ${input.id} and archived_at is null
    returning id`;
  return rows.length > 0;
}

/** Documents already made from it keep their own copy of the text (spec §5). */
export async function archiveTemplate(id: string, actor: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`
    update document_templates set archived_at = now(), updated_by = ${actor}, updated_at = now()
    where id = ${id} and archived_at is null
    returning id`;
  return rows.length > 0;
}
