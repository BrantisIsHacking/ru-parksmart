// Integrity of the generated data files and building lookup.
import { describe, expect, it } from "vitest";
import { ACTIVE_RULES, BUILDINGS, BUS_ROUTES, findBuilding, LOTS } from "./data";
import { resolvePlace } from "./places";
import { rankLots } from "./search";

describe("generated data", () => {
  it("has lots on all four New Brunswick campuses", () => {
    const campuses = new Set(LOTS.map((l) => l.campus));
    expect([...campuses].sort()).toEqual(["busch", "college_ave", "cook_douglass", "livingston"]);
  });
  it("every lot named in a rule exists", () => {
    const ids = new Set(LOTS.map((l) => l.id));
    for (const r of ACTIVE_RULES.rules) for (const id of r.lots) expect(ids.has(id), `${r.id}: ${id}`).toBe(true);
  });
  it("has hundreds of buildings, most commuter destinations with codes", () => {
    expect(BUILDINGS.length).toBeGreaterThan(300);
    expect(BUILDINGS.filter((b) => b.code).length).toBeGreaterThan(80);
  });
  it("every bus stop has coordinates and routes loop forward", () => {
    for (const r of BUS_ROUTES) {
      expect(r.loopMin, r.id).toBeGreaterThan(r.stops[r.stops.length - 1].offsetMin);
      for (const s of r.stops) {
        expect(Number.isFinite(s.center.lat) && Number.isFinite(s.center.lng), `${r.id} ${s.name}`).toBe(true);
      }
    }
  });
});

describe("findBuilding", () => {
  it.each([
    ["TIL", "Tillett Hall"],
    ["TIL-254", "Tillett Hall"],
    ["ARC 103", "Allison Road Classroom Building ARC"],
    ["hill center", "Hill Center for the Mathematical Sciences"],
    ["SC-102", "Scott Hall"],
    ["lucy stone", "Lucy Stone Hall"],
  ])("%s → %s", (query, name) => {
    expect(findBuilding(query)?.name).toBe(name);
  });
  it("returns nothing for gibberish", () => {
    expect(findBuilding("zzqx")).toBeUndefined();
  });
});

describe("rankLots", () => {
  it("finds lots by number or name", () => {
    expect(rankLots(LOTS, "98a")[0]?.id).toBe("COOK-98A");
    expect(rankLots(LOTS, "lot 915")[0]?.id).toBe("LIV-915");
    expect(rankLots(LOTS, "yellow")[0]?.id).toBe("LIV-915");
    expect(rankLots(LOTS, "stadium west")[0]?.id).toBe("BUS-613");
  });
});

describe("resolvePlace", () => {
  it("resolves a building name", () => {
    expect(resolvePlace("Tillett Hall").name).toBe("Tillett Hall");
  });
  it("keeps a map point and its label", () => {
    expect(resolvePlace(null, { lat: 40.5, lng: -74.45, label: "Scott Hall" })).toEqual({ name: "Scott Hall", center: { lat: 40.5, lng: -74.45 } });
  });
  it("rejects points outside New Brunswick", () => {
    expect(() => resolvePlace(null, { lat: 40.74, lng: -74.17 })).toThrow(/outside/);
  });
  it("explains unknown buildings", () => {
    expect(() => resolvePlace("Hogwarts")).toThrow(/Unknown building/);
  });
});
