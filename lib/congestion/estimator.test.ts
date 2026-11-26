import { describe, expect, it } from "vitest";
import { lotById } from "../data";
import { campusTimeOnDay } from "../time";
import type { Report } from "../types";
import { classWavePressure } from "./classWave";
import { baselineFill, estimateLot, statusForFill } from "./estimator";

const TUE = new Date("2026-11-24T17:00:00Z");
const SAT = new Date("2026-11-28T17:00:00Z");
const at = (ref: Date, h: number, m = 0) => campusTimeOnDay(ref, h * 60 + m);
const LIV_A = lotById("LIV-915")!;

const report = (value: Report["value"], when: Date, trust = 1, lotId = "LIV-915"): Report => ({
  lotId,
  value,
  reporter: "anon",
  trust,
  createdAt: when.toISOString(),
});

describe("classWavePressure", () => {
  it("peaks shortly before a class block and is low mid-block", () => {
    const before1020 = classWavePressure("livingston", at(TUE, 10, 5))!;
    const midBlock = classWavePressure("livingston", at(TUE, 11, 15))!;
    expect(before1020).toBeGreaterThan(0.8);
    expect(midBlock).toBeLessThan(0.2);
  });
  it("is zero on weekends and null for campuses without data", () => {
    expect(classWavePressure("livingston", at(SAT, 10, 5))).toBe(0);
    expect(classWavePressure("cook_douglass", at(TUE, 10, 5))).toBeNull();
  });
});

describe("baselineFill", () => {
  it("interpolates between hours and clamps outside the curve", () => {
    const b = { source: "rts" as const, weekday: { "9": 0.5, "10": 0.9 } };
    expect(baselineFill(b, 9 * 60 + 30)).toBeCloseTo(0.7);
    expect(baselineFill(b, 6 * 60)).toBe(0.5);
    expect(baselineFill(b, 23 * 60)).toBe(0.9);
  });
});

describe("statusForFill", () => {
  it("maps fill to green / yellow / red", () => {
    expect(statusForFill(0.5)).toBe("green");
    expect(statusForFill(0.8)).toBe("yellow");
    expect(statusForFill(0.95)).toBe("red");
  });
});

describe("estimateLot", () => {
  it("is Gray with no evidence (weekend, no reports)", () => {
    const now = at(SAT, 10);
    const e = estimateLot({ lot: LIV_A, forTime: now, now, reports: [] });
    expect(e.status).toBe("gray");
    expect(e.fill).toBeNull();
  });

  it("uses the baseline on a weekday with low confidence for a placeholder curve", () => {
    const now = at(TUE, 10, 10);
    const e = estimateLot({ lot: LIV_A, forTime: now, now, reports: [] });
    expect(e.status).not.toBe("gray");
    expect(e.confidence).toBeLessThan(0.4);
    expect(e.sources.map((s) => s.kind)).toEqual(["historical_baseline"]);
  });

  it("lets fresh trusted reports override a weak prior", () => {
    const now = at(TUE, 8, 30); // baseline says fairly empty at 8:30
    const reports = [report("crowded", at(TUE, 8, 25)), report("crowded", at(TUE, 8, 28))];
    const e = estimateLot({ lot: LIV_A, forTime: now, now, reports });
    expect(e.status).toBe("red");
    expect(e.sources.find((s) => s.kind === "student_reports")!.share).toBeGreaterThan(0.8);
  });

  it("gives low-trust reporters less influence than trusted ones", () => {
    const now = at(TUE, 8, 30);
    const lowTrust = estimateLot({ lot: LIV_A, forTime: now, now, reports: [report("crowded", now, 0.2)] });
    const highTrust = estimateLot({ lot: LIV_A, forTime: now, now, reports: [report("crowded", now, 1)] });
    expect(highTrust.fill!).toBeGreaterThan(lowTrust.fill!);
  });

  it("ignores stale reports, future reports and other lots", () => {
    const now = at(TUE, 8, 30);
    const reports = [
      report("crowded", at(TUE, 6, 0)), // too old
      report("crowded", at(TUE, 8, 40)), // after now
      report("crowded", now, 1, "LIV-916"), // other lot
    ];
    const e = estimateLot({ lot: LIV_A, forTime: now, now, reports });
    expect(e.sources.some((s) => s.kind === "student_reports")).toBe(false);
  });

  it("decays reports when predicting a later arrival", () => {
    const now = at(TUE, 8, 30);
    const reports = [report("crowded", now)];
    const soon = estimateLot({ lot: LIV_A, forTime: now, now, reports });
    const later = estimateLot({ lot: LIV_A, forTime: at(TUE, 9, 10), now, reports });
    const share = (e: typeof soon) => e.sources.find((s) => s.kind === "student_reports")?.share ?? 0;
    expect(share(later)).toBeLessThan(share(soon));
  });
});
