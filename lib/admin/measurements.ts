import "server-only";
import { db } from "@/lib/db";
import { deleteFile } from "./files";
import { workingWindows, type MeasureKind, type MeasureSet } from "./measure-kinds";
import type { Requirement } from "./measure-units";
import type { MeasurementInput } from "./schema";

export type WindowMeasurement = MeasurementInput & {
  id: string;
  leadId: string;
  kind: MeasureKind;
  position: number;
  measuredBy: string;
  createdAt: Date;
  updatedAt: Date;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One window in the owners' own words: "Dining Room, left window". Also names the window a
 *  customer picked in their service request, so both sides say the same thing. */
export const describe = (input: { room: string; label: string | null }) =>
  input.label ? `${input.room}, ${input.label}` : input.room;

const windows = (quantity: number) => (quantity > 1 ? `${quantity} windows` : "window");

function toMeasurement(row: Record<string, unknown>): WindowMeasurement {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    kind: row.kind as MeasureKind,
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
    quantity: Number(row.quantity),
    measuredBy: row.measured_by as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function listMeasurements(leadId: string): Promise<WindowMeasurement[]> {
  if (!UUID.test(leadId)) return [];
  const rows = await db()`select * from window_measurements where lead_id = ${leadId} order by position, created_at, id`;
  return rows.map(toMeasurement);
}

export async function getMeasurement(leadId: string, windowId: string): Promise<WindowMeasurement | null> {
  if (!UUID.test(leadId) || !UUID.test(windowId)) return null;
  const rows = await db()`select * from window_measurements where id = ${windowId} and lead_id = ${leadId}`;
  return rows[0] ? toMeasurement(rows[0]) : null;
}

/** Every window of the job (both kinds) and whether its designer measure is kept as official. */
export async function getMeasureSet(leadId: string): Promise<MeasureSet<WindowMeasurement>> {
  if (!UUID.test(leadId)) return { windows: [], kept: null };
  const [windows, rows] = await Promise.all([
    listMeasurements(leadId),
    db()`select designer_kept_official_at, designer_kept_official_by from leads where id = ${leadId}`,
  ]);
  const at = rows[0]?.designer_kept_official_at as string | Date | null | undefined;
  return { windows, kept: at ? { at: new Date(at), by: rows[0].designer_kept_official_by as string } : null };
}

/** The windows pricing and the customer's picker use: official if there is one, else designer. */
export async function listWorkingWindows(leadId: string): Promise<WindowMeasurement[]> {
  return workingWindows(await getMeasureSet(leadId));
}

export type AddResult = { id: string } | { refused: "missing" | "kept" };

/**
 * Adds a window to the end of the job's list, with its event, in one statement.
 * An official window is refused while the job keeps its designer measure as official, so a job
 * never has two competing official lists. A photo id is kept only if that file belongs to the
 * same job.
 */
export async function addMeasurement(
  leadId: string, kind: MeasureKind, input: MeasurementInput, actor: string,
): Promise<AddResult> {
  if (!UUID.test(leadId)) return { refused: "missing" };
  const rows = await db()`
    with job as (select id, designer_kept_official_at from leads where id = ${leadId}),
    allowed as (select id from job where ${kind}::text = 'designer' or designer_kept_official_at is null),
    photo as (select id from job_files where id = ${input.photoFileId} and lead_id = ${leadId} and kind = 'photo'),
    created as (
      insert into window_measurements (lead_id, kind, measured_by, position, room, label, width_eighths,
        height_eighths, depth_eighths, mount, requirements, notes, photo_file_id, quantity)
      select allowed.id, ${kind}, ${actor},
        (select coalesce(max(position), 0) + 1 from window_measurements where lead_id = ${leadId}),
        ${input.room}, ${input.label}, ${input.widthEighths}, ${input.heightEighths}, ${input.depthEighths},
        ${input.mount}, ${input.requirements}, ${input.notes}, (select id from photo), ${input.quantity}
      from allowed
      returning id, lead_id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'measure', ${`Added ${windows(input.quantity)} (${kind}): ${describe(input)}`} from created
    )
    select (select id from created) as id, exists (select 1 from job) as found`;
  const id = rows[0]?.id as string | null | undefined;
  if (id) return { id };
  return { refused: rows[0]?.found ? "kept" : "missing" };
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
    with previous as (select photo_file_id, quantity, kind from window_measurements where id = ${windowId} and lead_id = ${leadId}),
    photo as (select id from job_files where id = ${input.photoFileId} and lead_id = ${leadId} and kind = 'photo'),
    changed as (
      update window_measurements set
        room = ${input.room}, label = ${input.label}, width_eighths = ${input.widthEighths},
        height_eighths = ${input.heightEighths}, depth_eighths = ${input.depthEighths}, mount = ${input.mount},
        requirements = ${input.requirements}, notes = ${input.notes}, quantity = ${input.quantity},
        photo_file_id = coalesce((select id from photo), photo_file_id), updated_at = now()
      where id = ${windowId} and lead_id = ${leadId}
      returning id, lead_id, photo_file_id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select changed.lead_id, ${actor}, 'measure',
        case when previous.quantity = ${input.quantity} then ${`Edited ${windows(input.quantity)} (`} || previous.kind || ${`): ${describe(input)}`}
        else ${`Edited ${describe(input)} (`} || previous.kind || '): ' || previous.quantity::text || ${` → ${input.quantity} ${input.quantity > 1 ? "windows" : "window"}`} end
      from changed, previous
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
      returning lead_id, room, label, photo_file_id, quantity, kind
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'measure',
        case when quantity > 1 then 'Deleted ' || quantity::text || ' windows (' || kind || '): ' else 'Deleted window (' || kind || '): ' end || room || coalesce(', ' || label, '') from removed
    )
    select photo_file_id from removed`;
  if (!rows[0]) return false;
  const photo = rows[0].photo_file_id as string | null;
  if (photo) await deleteFile(photo, actor);
  return true;
}

export type KeepResult = "ok" | "unchanged" | "has-official" | "missing";

/**
 * Ticks or unticks "Keep as official measure", with its event, in one statement. Ticking is
 * refused while the job has any official window (one official list per job). Asking for what the
 * job already says changes nothing and logs nothing.
 *
 * Accepted limitation: someone ticking in the same instant another person saves the job's FIRST
 * official window can, under READ COMMITTED, let both succeed. officialWindows() then prefers the
 * designer list and the Measurements tab still shows the official rows, so nothing is hidden.
 */
export async function setKeptOfficial(leadId: string, kept: boolean, actor: string): Promise<KeepResult> {
  if (!UUID.test(leadId)) return "missing";
  const rows = await db()`
    with job as (select id, designer_kept_official_at is not null as was_kept from leads where id = ${leadId}),
    official as (select 1 from window_measurements where lead_id = ${leadId} and kind = 'official' limit 1),
    changed as (
      update leads set designer_kept_official_at = case when ${kept}::boolean then now() else null end,
        designer_kept_official_by = case when ${kept}::boolean then ${actor}::text else null end
      where id = ${leadId}
        and (designer_kept_official_at is not null) <> ${kept}::boolean
        and (not ${kept}::boolean or not exists (select 1 from official))
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select id, ${actor}, 'measure', ${kept ? "Designer measure kept as official" : "Designer measure no longer kept as official"}
      from changed
    )
    select exists (select 1 from changed) as changed, exists (select 1 from job) as found,
      (select was_kept from job) as was_kept, exists (select 1 from official) as has_official`;
  const row = rows[0];
  if (row?.changed) return "ok";
  if (!row?.found) return "missing";
  if (!kept || row.was_kept || !row.has_official) return "unchanged";
  return "has-official";
}
