import { describe, expect, it } from "vitest";
import type { ManualCount, Report } from "../types";
import { canReport, reportAgrees, scoreReports, trustScore } from "./trust";

describe("trustScore", () => {
  it("starts new reporters at 0.5 and stays within [0.2, 1]", () => {
    expect(trustScore()).toBe(0.5);
    expect(trustScore({ reporter: "a", agree: 50, disagree: 0 })).toBeLessThanOrEqual(1);
    expect(trustScore({ reporter: "a", agree: 0, disagree: 50 })).toBe(0.2);
  });
  it("rises with agreement", () => {
    expect(trustScore({ reporter: "a", agree: 4, disagree: 0 })).toBeGreaterThan(0.8);
  });
});

describe("reportAgrees", () => {
  it("compares the report with observed fill", () => {
    expect(reportAgrees("crowded", 0.9)).toBe(true);
    expect(reportAgrees("crowded", 0.5)).toBe(false);
    expect(reportAgrees("spaces_open", 0.5)).toBe(true);
  });
});

describe("canReport", () => {
  it("allows one report per 15-minute window", () => {
    const now = new Date("2026-11-24T15:00:00Z");
    expect(canReport(null, now)).toBe(true);
    expect(canReport("2026-11-24T14:50:00Z", now)).toBe(false);
    expect(canReport("2026-11-24T14:44:00Z", now)).toBe(true);
  });
});

describe("scoreReports", () => {
  it("credits reporters whose reports match a nearby manual count", () => {
    const count: ManualCount = { lotId: "LIV-915", occupied: 380, capacity: 400, countedAt: "2026-11-24T15:00:00Z", counter: "team" };
    const reports: Report[] = [
      { lotId: "LIV-915", value: "crowded", reporter: "good", trust: 0.5, createdAt: "2026-11-24T14:55:00Z" },
      { lotId: "LIV-915", value: "spaces_open", reporter: "bad", trust: 0.5, createdAt: "2026-11-24T15:05:00Z" },
      { lotId: "LIV-915", value: "spaces_open", reporter: "late", trust: 0.5, createdAt: "2026-11-24T16:00:00Z" },
      { lotId: "LIV-916", value: "spaces_open", reporter: "other", trust: 0.5, createdAt: "2026-11-24T15:00:00Z" },
    ];
    const out = scoreReports(reports, count, new Map());
    expect(out).toEqual([
      { reporter: "good", agree: 1, disagree: 0 },
      { reporter: "bad", agree: 0, disagree: 1 },
    ]);
  });
});
