import { describe, expect, it } from "vitest";
import { classRoom, classWhen, misreadDistance, resolveClassBuilding, splitLocation, suggestBuildings, suggestRooms } from "./classes";
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

describe("misread rooms", () => {
  // Real case: "LSH-B269" (Lucy Stone Hall, Livingston) was read as "LWH-B209".
  const misread = resolveClassBuilding(cls("LWH-B209", { campus: "livingston" }), BUILDINGS);

  it("asks the student to check the building and room instead of guessing", () => {
    expect(misread.buildingId).toBeNull();
    expect(misread.needsReview).toEqual(expect.arrayContaining(["building", "room"]));
    expect(misread).toMatchObject({ buildingCode: "LWH", room: "B209" });
  });

  it("suggests the one-letter-off building on the same campus first", () => {
    const [first] = suggestBuildings(misread, BUILDINGS);
    expect(first).toMatchObject({ code: "LSH", name: "Lucy Stone Hall", campus: "livingston" });
  });

  it("flags a room the building doesn't have and suggests the real one", () => {
    const wrongRoom = resolveClassBuilding(cls("LSH-B209", { campus: "livingston" }), BUILDINGS);
    expect(wrongRoom.building).toBe("Lucy Stone Hall");
    expect(wrongRoom.needsReview).toEqual(["room"]);
    expect(suggestRooms(wrongRoom)).toContain("B269");
    const right = resolveClassBuilding(cls("LSH-B269", { campus: "livingston" }), BUILDINGS);
    expect(right.needsReview).toBeUndefined();
    expect(suggestRooms(right)).toEqual([]);
  });

  it("resolves schedule codes the campus map labels differently", () => {
    expect(resolveClassBuilding(cls("ABW-2150"), BUILDINGS)).toMatchObject({ building: "Rutgers Academic Building", buildingCode: "ABW", campus: "college_ave" });
  });

  it("does not fuzzy-match an unknown code to some other building", () => {
    expect(resolveClassBuilding(cls("SERC-213", { campus: "busch" }), BUILDINGS).buildingId).toBeNull();
    expect(suggestBuildings(resolveClassBuilding(cls("SERC-213", { campus: "busch" }), BUILDINGS), BUILDINGS)[0]?.code).toBe("SEC");
  });

  it("counts look-alike characters as closer misreads", () => {
    expect(misreadDistance("B8", "BB")).toBe(0.5);
    expect(misreadDistance("LWH", "LSH")).toBe(1);
  });

  it("has no suggestions once the building is resolved", () => {
    expect(suggestBuildings(resolveClassBuilding(cls("TIL-254"), BUILDINGS), BUILDINGS)).toEqual([]);
  });
});

describe("labels", () => {
  it("formats when and where", () => {
    expect(classWhen({ days: [2, 5], start: "10:20" })).toBe("Tue/Fri 10:20 AM");
    expect(classWhen({ days: [1], start: "14:00" })).toBe("Mon 2:00 PM");
    expect(classRoom({ buildingCode: "BE", room: "AUD" })).toBe("BE-AUD");
  });
});
