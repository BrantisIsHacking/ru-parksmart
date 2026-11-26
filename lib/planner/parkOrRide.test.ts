import { describe, expect, it } from "vitest";
import { BUS_ROUTES, findBuilding, LOTS } from "../data";
import { campusParts, campusTimeOnDay } from "../time";
import type { LotEstimate, LotStatus } from "../types";
import { latestDeparture, planTrip } from "./parkOrRide";

const TUE = new Date("2026-11-24T17:00:00Z");
const at = (h: number, m = 0) => campusTimeOnDay(TUE, h * 60 + m);
const tillett = findBuilding("tillett")!;

const est = (lotId: string, status: LotStatus): LotEstimate => ({
  lotId,
  status,
  fill: status === "red" ? 0.95 : status === "yellow" ? 0.8 : 0.5,
  confidence: 0.6,
  forTime: at(11).toISOString(),
  computedAt: at(10, 30).toISOString(),
  sources: [],
});

describe("latestDeparture", () => {
  it("snaps to the scheduled headway at a stop", () => {
    const route = BUS_ROUTES.find((r) => r.id === "B")!;
    const stop = route.stops[0];
    const dep = latestDeparture(route, stop, at(10, 47))!;
    const { minutes } = campusParts(dep);
    expect(minutes).toBe(10 * 60 + 44); // 07:00 + 32 x 7 min
  });
  it("returns null before service starts", () => {
    const route = BUS_ROUTES.find((r) => r.id === "B")!;
    expect(latestDeparture(route, route.stops[0], at(6, 0))).toBeNull();
  });
});

const LIVINGSTON_FLEX = ["LIV-915", "LIV-916", "LIV-107", "LIV-108", "LIV-111"];

describe("planTrip", () => {
  it("recommends the Yellow Lot for a Livingston commuter when it is likely open", () => {
    const estimates = new Map([["LIV-915", est("LIV-915", "green")]]);
    const plan = planTrip({ permitId: "commuter-livingston", destination: tillett, arriveBy: at(11), estimates });
    expect(plan.recommended?.lotId).toBe("LIV-915");
    expect(plan.recommended?.lotId).toBe(plan.usual?.lotId);
    expect(plan.parkAndRide).toBe(false);
    expect(plan.recommended?.mode).toBe("walk");
  });

  it("has no daytime alternative for a Livingston commuter, even when the Yellow Lot is full", () => {
    const estimates = new Map([["LIV-915", est("LIV-915", "red")]]);
    const plan = planTrip({ permitId: "commuter-livingston", destination: tillett, arriveBy: at(11), estimates });
    expect(plan.recommended?.lotId).toBe("LIV-915");
    expect(plan.alternatives).toEqual([]);
    expect(plan.parkAndRide).toBe(false);
  });

  it("suggests another campus's flex lot and a bus in the evening when Livingston lots are full", () => {
    const estimates = new Map(LIVINGSTON_FLEX.map((id) => [id, est(id, "red")]));
    const plan = planTrip({ permitId: "commuter-livingston", destination: tillett, arriveBy: at(18, 30), estimates });
    expect(plan.recommended?.lotId.startsWith("LIV-")).toBe(false);
    expect(plan.recommended?.mode).toBe("bus");
    expect(["B", "LX"]).toContain(plan.recommended?.bus?.routeId);
    expect(plan.parkAndRide).toBe(true);
    // Bus must get the student there by 18:30.
    const bus = plan.recommended!.bus!;
    const arrive = new Date(bus.departAt).getTime() + (bus.rideMin + bus.walkFromStopMin) * 60_000;
    expect(arrive).toBeLessThanOrEqual(at(18, 30).getTime());
  });

  it("never offers a lot the permit does not allow", () => {
    const plan = planTrip({ permitId: "commuter-livingston", destination: tillett, arriveBy: at(11), estimates: new Map() });
    const ids = [plan.recommended, ...plan.alternatives].map((o) => o?.lotId);
    expect(ids).not.toContain("LIV-916"); // flex-only before 5 PM
    expect(ids).not.toContain("LIV-103"); // resident lot
    expect(ids).not.toContain("BUS-613"); // needs a Busch permit
  });

  it("plans to a point picked on the map", () => {
    const point = { name: "Dropped pin", center: { lat: 40.5232, lng: -74.4365 } }; // next to Tillett
    const plan = planTrip({ permitId: "commuter-livingston", destination: point, arriveBy: at(11), estimates: new Map() });
    expect(plan.destination).toBe("Dropped pin");
    expect(plan.destinationCenter).toEqual(point.center);
    expect(plan.recommended?.lotId).toBe("LIV-915");
  });

  it("takes the bus instead of a long walk when the bus is faster", () => {
    const hill = findBuilding("HLL")!;
    const plan = planTrip({ permitId: "commuter-busch", destination: hill, arriveBy: at(14), estimates: new Map() });
    const stadium = [plan.recommended, ...plan.alternatives].find((o) => o?.lotId === "BUS-613")!;
    expect(stadium.walkMin).toBeGreaterThan(12);
    expect(stadium.mode).toBe("bus");
    expect(stadium.totalMin).toBeLessThan(stadium.walkMin + 3);
    expect(stadium.bus?.fromStop).toBe("Stadium West Lot");
  });

  it("never plans to a lot with only approximate coordinates", () => {
    const lots = LOTS.map((l) => (l.id === "LIV-915" ? { ...l, coordsApprox: true } : l));
    const plan = planTrip({ permitId: "commuter-livingston", destination: tillett, arriveBy: at(11), estimates: new Map(), lots });
    expect(plan.recommended).toBeNull();
  });
});
