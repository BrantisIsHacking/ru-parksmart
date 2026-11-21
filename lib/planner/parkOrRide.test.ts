import { describe, expect, it } from "vitest";
import { BUS_ROUTES, findBuilding } from "../data";
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
    expect(minutes).toBe(10 * 60 + 40);
  });
  it("returns null before service starts", () => {
    const route = BUS_ROUTES.find((r) => r.id === "B")!;
    expect(latestDeparture(route, route.stops[0], at(6, 0))).toBeNull();
  });
});

describe("planTrip", () => {
  it("recommends the closest lot when it is likely open", () => {
    const estimates = new Map([
      ["LIV-A", est("LIV-A", "green")],
      ["LIV-B", est("LIV-B", "green")],
      ["BUS-A", est("BUS-A", "green")],
    ]);
    const plan = planTrip({ permitId: "commuter-livingston", destination: tillett, arriveBy: at(11), estimates });
    expect(plan.recommended?.lotId).toBe(plan.usual?.lotId);
    expect(plan.parkAndRide).toBe(false);
    expect(plan.recommended?.mode).toBe("walk");
  });

  it("suggests park-and-ride on Busch when Livingston lots are full", () => {
    const estimates = new Map([
      ["LIV-A", est("LIV-A", "red")],
      ["LIV-B", est("LIV-B", "red")],
      ["BUS-A", est("BUS-A", "green")],
    ]);
    const plan = planTrip({ permitId: "commuter-livingston", destination: tillett, arriveBy: at(11), estimates });
    expect(plan.recommended?.lotId).toBe("BUS-A");
    expect(plan.recommended?.mode).toBe("bus");
    expect(plan.recommended?.bus?.routeId).toBe("B");
    expect(plan.parkAndRide).toBe(true);
    // Bus must get the student there by 11:00.
    const bus = plan.recommended!.bus!;
    const arrive = new Date(bus.departAt).getTime() + (bus.rideMin + bus.walkFromStopMin) * 60_000;
    expect(arrive).toBeLessThanOrEqual(at(11).getTime());
  });

  it("never offers a lot the permit does not allow", () => {
    const plan = planTrip({ permitId: "commuter-livingston", destination: tillett, arriveBy: at(11), estimates: new Map() });
    const ids = [plan.recommended, ...plan.alternatives].map((o) => o?.lotId);
    expect(ids).not.toContain("LIV-C");
  });
});
