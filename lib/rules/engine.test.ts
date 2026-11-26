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
  ["LIV-915", "commuter-livingston", "Tue", "10:15", true],
  ["LIV-915", "commuter-livingston", "Tue", "05:30", false], // permit hours start at 6 AM
  ["LIV-916", "commuter-livingston", "Tue", "10:15", false], // Green Lot is flex-only for commuters
  ["LIV-916", "commuter-livingston", "Tue", "17:30", true], // weekday flex from 5 PM
  ["LIV-916", "commuter-livingston", "Wed", "00:30", false], // no overnight
  ["LIV-916", "commuter-livingston", "Sat", "11:00", true], // weekend flex
  ["BUS-613", "commuter-livingston", "Tue", "10:15", false],
  ["BUS-613", "commuter-livingston+secondary-busch", "Tue", "10:15", true],
  ["BUS-613", "commuter-livingston+secondary-busch", "Tue", "09:30", false], // secondary starts at 10 AM
  ["BUS-613", "commuter-livingston+secondary-busch", "Sat", "11:00", false], // secondary is weekdays only; 613 is not a flex lot
  ["LIV-915", "commuter-livingston+secondary-busch", "Tue", "09:30", true], // primary still applies
  ["BUS-613", "commuter-busch", "Sat", "07:00", true],
  ["BUS-60A", "commuter-busch", "Tue", "10:15", false],
  ["BUS-60A", "commuter-busch", "Tue", "18:00", true],
  ["LIV-103", "resident-livingston", "Wed", "03:00", true], // resident lot is 24/7
  ["LIV-103", "commuter-livingston", "Tue", "18:00", false], // resident lots are not flex lots
  ["LIV-915", "daily-livingston", "Tue", "10:15", true],
  ["LIV-915", "daily-livingston", "Sat", "10:15", false],
  ["LIV-916", "daily-livingston", "Tue", "18:00", false], // daily permits get no flex time
  ["LIV-915", "none", "Tue", "10:15", false],
  ["LIV-915", "commuter-college-ave", "Tue", "10:15", false],
  ["LIV-915", "commuter-college-ave", "Tue", "17:00", true],
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
    expect(checkPermit(ACTIVE_RULES, "LIV-915", "gold-pass", at("Tue", "10:00")).allowed).toBe(false);
    const unknownLot = checkPermit(ACTIVE_RULES, "LOT-999", "commuter-livingston", at("Tue", "10:00"));
    expect(unknownLot.allowed).toBe(false);
    expect(unknownLot.verified).toBe(false);
  });

  it("marks answers unverified while the rules file is a draft", () => {
    const res = checkPermit(ACTIVE_RULES, "LIV-915", "commuter-livingston", at("Tue", "10:15"));
    expect(res.verified).toBe(ACTIVE_RULES.verified);
  });

  it("evaluates in campus time regardless of the Date's UTC offset", () => {
    // 15:15 UTC is 10:15 AM in New Brunswick (EST, UTC-5).
    const res = checkPermit(ACTIVE_RULES, "LIV-915", "commuter-livingston", new Date("2026-11-24T15:15:00Z"));
    expect(res.at).toBe("Tue 10:15 AM");
  });
});

describe("eligibleLots", () => {
  it("lists only lots the permit may use", () => {
    const ids = eligibleLots(ACTIVE_RULES, "commuter-livingston", at("Tue", "10:15")).map((c) => c.lotId);
    expect(ids).toEqual(["LIV-915"]);
  });

  it("adds the secondary campus for a combined permit", () => {
    const ids = eligibleLots(ACTIVE_RULES, "commuter-livingston+secondary-busch", at("Tue", "10:15")).map((c) => c.lotId);
    expect(ids.sort()).toEqual(["BUS-613", "LIV-915"]);
  });
});
