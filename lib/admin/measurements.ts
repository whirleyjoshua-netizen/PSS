import "server-only";
import { db } from "@/lib/db";
import { deleteFile } from "./files";
import type { Requirement } from "./measure-units";
import type { MeasurementInput } from "./schema";

export type WindowMeasurement = MeasurementInput & {
  id: string;
  leadId: string;
  position: number;
  measuredBy: string;
  createdAt: Date;
  updatedAt: Date;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const describe = (input: { room: string; label: string | null }) =>
  input.label ? `${input.room}, ${input.label}` : input.room;

function toMeasurement(row: Record<string, unknown>): WindowMeasurement {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    position: Number(row.position),
    room: row.room as string,
    label: (row.label as string | null) ?? null,
    widthEighths: Number(row.width_eighths),
    heightEighths: Number(row.height_eighths),
    depthEighths: row.depth_eighths === null ? null : Number(row.depth_eighths),
    mount: row.mount as "inside" | "outside",
    requirements: (row.requirements as Requirement[]) ?? [],
    notes: (row.notes as string | null) ?? null,
    photoFileId: (row.photo_file_id as string | null) ?? null,
    measuredBy: row.measured_by as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function listMeasurements(leadId: string): Promise<WindowMeasurement[]> {
  if (!UUID.test(leadId)) return [];
  const rows = await db()`select * from window_measurements where lead_id = ${leadId} order by position`;
  return rows.map(toMeasurement);
}

export async function getMeasurement(leadId: string, windowId: string): Promise<WindowMeasurement | null> {
  if (!UUID.test(leadId) || !UUID.test(windowId)) return null;
  const rows = await db()`select * from window_measurements where id = ${windowId} and lead_id = ${leadId}`;
  return rows[0] ? toMeasurement(rows[0]) : null;
}

/**
 * Adds a window at the end of the job's list, with its event, in one statement.
 * A photo id is kept only if that file belongs to the same job.
 */
export async function addMeasurement(leadId: string, input: MeasurementInput, actor: string): Promise<string | null> {
  if (!UUID.test(leadId)) return null;
  const rows = await db()`
    with job as (select id from leads where id = ${leadId}),
    photo as (select id from job_files where id = ${input.photoFileId} and lead_id = ${leadId}),
    created as (
      insert into window_measurements (lead_id, measured_by, position, room, label, width_eighths,
        height_eighths, depth_eighths, mount, requirements, notes, photo_file_id)
      select job.id, ${actor},
        (select coalesce(max(position), 0) + 1 from window_measurements where lead_id = ${leadId}),
        ${input.room}, ${input.label}, ${input.widthEighths}, ${input.heightEighths}, ${input.depthEighths},
        ${input.mount}, ${input.requirements}, ${input.notes}, (select id from photo)
      from job
      returning id, lead_id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'measure', ${`Added window: ${describe(input)}`} from created
    )
    select id from created`;
  return (rows[0]?.id as string | undefined) ?? null;
}

/**
 * Updates a window of this job with its event. When a new photo (from the
 * same job) replaces a different existing one, the previous photo file is
 * deleted after the update succeeds so it does not linger unreferenced.
 */
export async function updateMeasurement(
  leadId: string, windowId: string, input: MeasurementInput, actor: string,
): Promise<boolean> {
  if (!UUID.test(leadId) || !UUID.test(windowId)) return false;
  const rows = await db()`
    with previous as (select photo_file_id from window_measurements where id = ${windowId} and lead_id = ${leadId}),
    photo as (select id from job_files where id = ${input.photoFileId} and lead_id = ${leadId}),
    changed as (
      update window_measurements set
        room = ${input.room}, label = ${input.label}, width_eighths = ${input.widthEighths},
        height_eighths = ${input.heightEighths}, depth_eighths = ${input.depthEighths}, mount = ${input.mount},
        requirements = ${input.requirements}, notes = ${input.notes},
        photo_file_id = coalesce((select id from photo), photo_file_id), updated_at = now()
      where id = ${windowId} and lead_id = ${leadId}
      returning id, lead_id, photo_file_id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'measure', ${`Edited window: ${describe(input)}`} from changed
    )
    select changed.id, previous.photo_file_id as previous_photo_id, changed.photo_file_id as new_photo_id
    from changed, previous`;
  if (!rows[0]) return false;
  const previousPhoto = rows[0].previous_photo_id as string | null;
  const newPhoto = rows[0].new_photo_id as string | null;
  if (previousPhoto && previousPhoto !== newPhoto) await deleteFile(previousPhoto, actor);
  return true;
}

/** Deletes the window with its event, then its photo (if it had one). */
export async function deleteMeasurement(leadId: string, windowId: string, actor: string): Promise<boolean> {
  if (!UUID.test(leadId) || !UUID.test(windowId)) return false;
  const rows = await db()`
    with removed as (
      delete from window_measurements where id = ${windowId} and lead_id = ${leadId}
      returning lead_id, room, label, photo_file_id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'measure',
        'Deleted window: ' || room || coalesce(', ' || label, '') from removed
    )
    select photo_file_id from removed`;
  if (!rows[0]) return false;
  const photo = rows[0].photo_file_id as string | null;
  if (photo) await deleteFile(photo, actor);
  return true;
}
