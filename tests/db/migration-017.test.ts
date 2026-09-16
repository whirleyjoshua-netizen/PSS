import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FILE = "db/migrations/017_routes.sql";
const statements = readFileSync(FILE, "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const all = statements.join(" ");

describe("migration 017", () => {
  it("adds the window and length to appointments", () => {
    expect(all).toContain("alter table appointments add column if not exists window_start time");
    expect(all).toContain("alter table appointments add column if not exists window_end time");
    expect(all).toContain("alter table appointments add column if not exists duration_minutes integer");
  });

  it("drops then re-adds the length and window checks", () => {
    for (const name of ["appointments_duration_minutes_check", "appointments_window_check"]) {
      const dropAt = statements.findIndex((s) => s.includes(`drop constraint if exists ${name}`));
      const addAt = statements.findIndex((s) => s.includes(`add constraint ${name}`));
      expect(dropAt).toBeGreaterThanOrEqual(0);
      expect(addAt).toBeGreaterThan(dropAt);
    }
    expect(all).toContain("duration_minutes is null or duration_minutes between 15 and 720");
    expect(all).toContain(
      "(window_start is null and window_end is null) or (window_start is not null and window_end is not null and window_start < window_end)",
    );
  });

  it("moves 08:00 all-day installs to 09:00 without touching updated_at, so a re-run changes nothing", () => {
    const move = statements.find((s) => s.startsWith("update appointments"));
    expect(move).toBeDefined();
    expect(move).toContain("all_day");
    expect(move).toContain("(starts_at at time zone 'America/Los_Angeles')::time = '08:00'");
    expect(move).not.toContain("updated_at");
  });

  it("adds the geocode columns to leads", () => {
    expect(all).toContain("alter table leads add column if not exists lat double precision");
    expect(all).toContain("alter table leads add column if not exists lng double precision");
    expect(all).toContain("alter table leads add column if not exists geocoded_at timestamptz");
    expect(all).toContain("alter table leads add column if not exists geocode_status text");
    expect(all).toContain("geocode_status is null or geocode_status in ('ok','not_found','error')");
  });

  it("creates the single-row route settings and seeds it once", () => {
    const table = statements.find((s) => s.startsWith("create table if not exists route_settings"));
    expect(table).toContain("id boolean primary key default true check (id)");
    expect(table).toContain("day_start time not null default '09:00'");
    expect(table).toContain("day_end time not null default '18:00'");
    expect(table).toContain("install_minutes integer not null default 240");
    expect(all).toContain("insert into route_settings (id) values (true) on conflict (id) do nothing");
  });

  it("creates route_stops with one stop per appointment and one position per installer per day", () => {
    const table = statements.find((s) => s.startsWith("create table if not exists route_stops"));
    expect(table).toContain("appointment_id uuid not null unique references appointments(id) on delete cascade");
    expect(table).toContain("team_member_id uuid not null references team_members(id) on delete cascade");
    expect(table).toContain("unique (route_date, team_member_id, position)");
    // How many stops the day had when saved: a cancelled appointment cascades its stop away, and this is how that is noticed.
    expect(table).toContain("saved_count integer not null default 0");
    expect(all).toContain("create index if not exists route_stops_date_idx on route_stops (route_date)");
  });

  it("is re-runnable", () => {
    for (const s of statements) {
      expect(s).toMatch(
        /^(create table if not exists|create index if not exists|alter table (appointments|leads) (add column if not exists|drop constraint if exists|add constraint)|update appointments|insert into route_settings)/,
      );
    }
  });

  it("keeps comments to whole lines, with no semicolons inside them", () => {
    for (const line of readFileSync(FILE, "utf8").split("\n")) {
      if (line.includes("--")) {
        expect(line.trim().startsWith("--")).toBe(true);
        expect(line).not.toContain(";");
      }
    }
  });
});
