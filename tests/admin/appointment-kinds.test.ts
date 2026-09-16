import { describe, it, expect } from "vitest";
import {
  APPOINTMENT_KINDS, APPOINTMENT_STYLE, isAppointmentKind, kindLabel, type AppointmentKind,
} from "@/lib/admin/appointment-kinds";
import { ICON_NAMES } from "@/components/admin/icons";

describe("appointment kinds", () => {
  it("offers the four kinds, in order, with their labels", () => {
    expect(APPOINTMENT_KINDS.map((kind) => kind.value)).toEqual([
      "consultation", "measure", "install", "service",
    ]);
    expect(APPOINTMENT_KINDS.map((kind) => kind.label)).toEqual([
      "Consultation", "Measure", "Install", "Service",
    ]);
  });

  it("recognises the four kinds and nothing else", () => {
    for (const kind of APPOINTMENT_KINDS) expect(isAppointmentKind(kind.value)).toBe(true);
    expect(isAppointmentKind("visit")).toBe(false);
    expect(isAppointmentKind(null)).toBe(false);
    expect(isAppointmentKind(undefined)).toBe(false);
  });

  it("labels each kind", () => {
    expect(kindLabel("consultation")).toBe("Consultation");
    expect(kindLabel("measure")).toBe("Measure");
    expect(kindLabel("install")).toBe("Install");
    expect(kindLabel("service")).toBe("Service");
  });

  it("styles every kind with an icon that exists and complete class literals", () => {
    for (const { value } of APPOINTMENT_KINDS) {
      const style = APPOINTMENT_STYLE[value as AppointmentKind];
      expect(ICON_NAMES).toContain(style.icon);
      expect(style.tint).toMatch(/^text-appt-[a-z]+$/);
      expect(style.edge).toMatch(/^border-t-appt-[a-z]+$/);
      expect(style.left).toMatch(/^border-l-appt-[a-z]+$/);
    }
    expect(Object.keys(APPOINTMENT_STYLE)).toHaveLength(APPOINTMENT_KINDS.length);
  });

  it("has a color token in globals.css behind every class", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("app/globals.css", "utf8");
    for (const { value } of APPOINTMENT_KINDS) {
      const token = APPOINTMENT_STYLE[value as AppointmentKind].tint.replace("text-", "--color-");
      expect(css).toContain(`${token}:`);
    }
  });

  it("uses each kind's own icon", () => {
    expect(APPOINTMENT_KINDS.every((kind) => APPOINTMENT_STYLE[kind.value as AppointmentKind].icon === kind.icon))
      .toBe(true);
  });
});
