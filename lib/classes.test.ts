import { describe, expect, it } from "vitest";
import { classRoom, classWhen, resolveClassBuilding, splitLocation } from "./classes";
import { BUILDINGS } from "./data";
import { resolvePlace } from "./places";
import type { ClassEntry } from "./types";

const cls = (building: string, extra: Partial<ClassEntry> = {}): ClassEntry => ({ building, days: [2, 5], start: "10:20", ...extra });

describe("splitLocation", () => {
  it.each([
    ["BE-AUD", "BE", "AUD"],
    ["TIL-254", "TIL", "254"],
    ["ARC 103", "ARC", "103"],
    ["HLL114", "HLL", "114"],
  ])("%s → %s + %s", (raw, code, room) => {
    expect(splitLocation(raw)).toEqual({ code, room });
  });
  it("leaves building names alone", () => {
    expect(splitLocation("Hill Center")).toEqual({});
  });
});

describe("resolveClassBuilding", () => {
  it("turns a schedule room into a building, code, room and campus", () => {
    const r = resolveClassBuilding(cls("BE-AUD", { campus: "livingston" }), BUILDINGS);
    expect(r).toMatchObject({ building: "Beck Hall", buildingCode: "BE", room: "AUD", campus: "livingston" });
    expect(r.buildingId).toMatch(/^b\d+/);
  });
  it("resolves names typed by hand", () => {
    expect(resolveClassBuilding(cls("hill center"), BUILDINGS)).toMatchObject({ buildingCode: "HLL", campus: "busch" });
  });
  it("keeps an already-picked building", () => {
    const tillett = BUILDINGS.find((b) => b.code === "TIL")!;
    const r = resolveClassBuilding(cls("whatever", { buildingId: tillett.id }), BUILDINGS);
    expect(r.building).toBe("Tillett Hall");
  });
  it("marks unknown buildings as unresolved instead of guessing", () => {
    expect(resolveClassBuilding(cls("ZZQ-101"), BUILDINGS).buildingId).toBeNull();
  });
  it("gives the planner a building id it can use directly", () => {
    const r = resolveClassBuilding(cls("TIL-254"), BUILDINGS);
    expect(resolvePlace(r.buildingId).name).toBe("Tillett Hall");
  });
});

describe("labels", () => {
  it("formats when and where", () => {
    expect(classWhen({ days: [2, 5], start: "10:20" })).toBe("Tue/Fri 10:20 AM");
    expect(classWhen({ days: [1], start: "14:00" })).toBe("Mon 2:00 PM");
    expect(classRoom({ buildingCode: "BE", room: "AUD" })).toBe("BE-AUD");
  });
});
