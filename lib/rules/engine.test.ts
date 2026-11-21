// Table-driven permit tests. Before the pilot, every row here must be checked
// against the official Rutgers rules; the pilot gate is "all rows pass".
import { describe, expect, it } from "vitest";
import { ACTIVE_RULES, LOTS } from "../data";
import { campusTimeOnDay } from "../time";
import { checkPermit, eligibleLots, validateRules } from "./engine";

// Reference days in Nov 2026 (noon UTC is the same campus date).
const DAYS = {
  Mon: new Date("2026-11-23T17:00:00Z"),
  Tue: new Date("2026-11-24T17:00:00Z"),
  Wed: new Date("2026-11-25T17:00:00Z"),
  Fri: new Date("2026-11-27T17:00:00Z"),
  Sat: new Date("2026-11-28T17:00:00Z"),
} as const;
type Day = keyof typeof DAYS;

const at = (day: Day, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return campusTimeOnDay(DAYS[day], h * 60 + m);
};

// lot, permit, day, campus time, expected
const CASES: [string, string, Day, string, boolean][] = [
  ["LIV-A", "commuter-livingston", "Tue", "10:15", true],
  ["LIV-B", "commuter-livingston", "Mon", "08:00", true],
  ["LIV-C", "commuter-livingston", "Tue", "10:15", false],
  ["LIV-C", "commuter-livingston", "Tue", "18:30", true], // after-6 exception
  ["LIV-C", "commuter-livingston", "Wed", "01:30", true], // overnight tail of Tue window
  ["LIV-C", "commuter-livingston", "Wed", "02:30", false], // overnight window closed
  ["LIV-C", "resident-livingston", "Tue", "10:15", true],
  ["LIV-A", "commuter-busch", "Tue", "10:15", false],
  ["BUS-A", "commuter-busch", "Tue", "10:15", true],
  ["BUS-A", "commuter-livingston", "Tue", "10:15", true],
  ["LIV-A", "none", "Tue", "19:00", false], // "*" never includes no-permit
  ["LIV-A", "commuter-college-ave", "Sat", "11:00", true], // weekend
  ["LIV-A", "commuter-college-ave", "Fri", "11:00", false],
];

describe("rules file", () => {
  it("is structurally valid", () => {
    expect(validateRules(ACTIVE_RULES)).toEqual([]);
  });
  it("covers every pilot lot", () => {
    const covered = new Set(ACTIVE_RULES.rules.flatMap((r) => r.lots));
    for (const lot of LOTS) expect(covered.has(lot.id)).toBe(true);
  });
});

describe("checkPermit", () => {
  it.each(CASES)("%s with %s on %s %s → %s", (lot, permit, day, time, expected) => {
    const res = checkPermit(ACTIVE_RULES, lot, permit, at(day, time));
    expect(res.allowed).toBe(expected);
    if (expected) expect(res.matchedRuleId).not.toBeNull();
  });

  it("rejects unknown permits and lots without guessing", () => {
    expect(checkPermit(ACTIVE_RULES, "LIV-A", "gold-pass", at("Tue", "10:00")).allowed).toBe(false);
    const unknownLot = checkPermit(ACTIVE_RULES, "LOT-999", "commuter-livingston", at("Tue", "10:00"));
    expect(unknownLot.allowed).toBe(false);
    expect(unknownLot.verified).toBe(false);
  });

  it("marks answers unverified while the rules file is a draft", () => {
    const res = checkPermit(ACTIVE_RULES, "LIV-A", "commuter-livingston", at("Tue", "10:15"));
    expect(res.verified).toBe(ACTIVE_RULES.verified);
  });

  it("evaluates in campus time regardless of the Date's UTC offset", () => {
    // 15:15 UTC is 10:15 AM in New Brunswick (EST, UTC-5).
    const res = checkPermit(ACTIVE_RULES, "LIV-A", "commuter-livingston", new Date("2026-11-24T15:15:00Z"));
    expect(res.at).toBe("Tue 10:15 AM");
  });
});

describe("eligibleLots", () => {
  it("lists only lots the permit may use", () => {
    const ids = eligibleLots(ACTIVE_RULES, "commuter-livingston", at("Tue", "10:15")).map((c) => c.lotId);
    expect(ids.sort()).toEqual(["BUS-A", "LIV-A", "LIV-B"]);
  });
});
