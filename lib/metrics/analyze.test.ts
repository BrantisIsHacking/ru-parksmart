import { describe, expect, it } from "vitest";
import { campusTimeOnDay } from "../time";
import type { ManualCount, MetricEvent, Report } from "../types";
import { evaluatePredictions, summarizePilot, toCsv } from "./analyze";

const TUE = new Date("2026-11-24T17:00:00Z");
const at = (h: number, m = 0) => campusTimeOnDay(TUE, h * 60 + m).toISOString();

const ev = (type: MetricEvent["type"], reporter: string, props?: MetricEvent["props"]): MetricEvent => ({
  type,
  reporter,
  props,
  createdAt: at(10),
});

describe("summarizePilot", () => {
  it("computes decision time, uptake and satisfaction", () => {
    const events = [
      ev("app_open", "a"),
      ev("app_open", "b"),
      ev("decision", "a", { decisionMs: 20_000 }),
      ev("decision", "b", { decisionMs: 40_000 }),
      ev("decision", "b", { decisionMs: -5 }), // ignored
      ev("parkorride_shown", "a"),
      ev("parkorride_shown", "b"),
      ev("parkorride_followed", "a"),
      ev("satisfaction", "a", { rating: 5 }),
      ev("satisfaction", "b", { rating: 4 }),
    ];
    const s = summarizePilot(events, [], []);
    expect(s.participants).toBe(2);
    expect(s.decisions.count).toBe(2);
    expect(s.decisions.medianSeconds).toBe(30);
    expect(s.parkOrRide.uptake).toBe(0.5);
    expect(s.satisfaction.average).toBe(4.5);
  });

  it("scores report reliability against manual counts", () => {
    const counts: ManualCount[] = [{ lotId: "LIV-A", occupied: 390, capacity: 400, countedAt: at(10, 15), counter: "t" }];
    const reports: Report[] = [
      { lotId: "LIV-A", value: "crowded", reporter: "a", trust: 0.5, createdAt: at(10, 10) },
      { lotId: "LIV-A", value: "spaces_open", reporter: "b", trust: 0.5, createdAt: at(10, 12) },
    ];
    const s = summarizePilot([], reports, counts);
    expect(s.reportReliability).toEqual({ matched: 2, agreementRate: 0.5 });
  });
});

describe("evaluatePredictions", () => {
  it("only uses reports submitted before each count", () => {
    const counts: ManualCount[] = [{ lotId: "LIV-A", occupied: 390, capacity: 400, countedAt: at(8, 30), counter: "t" }];
    const before: Report[] = [
      { lotId: "LIV-A", value: "crowded", reporter: "a", trust: 1, createdAt: at(8, 25) },
      { lotId: "LIV-A", value: "crowded", reporter: "b", trust: 1, createdAt: at(8, 27) },
    ];
    const after: Report[] = before.map((r) => ({ ...r, createdAt: at(8, 45) }));
    expect(evaluatePredictions(counts, before).confusion.red.red).toBe(1);
    expect(evaluatePredictions(counts, after).confusion.red.red).toBe(0);
  });
});

describe("toCsv", () => {
  it("flattens props and escapes values", () => {
    const csv = toCsv([{ type: "decision", props: { decisionMs: 1200, note: 'a,"b"' } }]);
    expect(csv).toBe('type,props.decisionMs,props.note\ndecision,1200,"a,""b"""');
  });
});
