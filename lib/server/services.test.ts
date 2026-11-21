import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./store", () => ({ getStore: () => ({ reportsSince: async () => [] }) }));

const { nextClassToday, resolveTime } = await import("./services");
const { campusParts } = await import("../time");

// Fri Nov 20 2026, 11:12 PM in New Brunswick.
const LATE = new Date("2026-11-21T04:12:00Z");
// Tue Nov 24 2026, 9:00 AM in New Brunswick.
const MORNING = new Date("2026-11-24T14:00:00Z");

describe("resolveTime", () => {
  it("reads 24h and am/pm clock times in campus time", () => {
    expect(campusParts(resolveTime("10:30", MORNING)).minutes).toBe(10 * 60 + 30);
    expect(campusParts(resolveTime("2:15 pm", MORNING)).minutes).toBe(14 * 60 + 15);
  });
  it("rolls a clock time well in the past to tomorrow", () => {
    const t = resolveTime("11:00", LATE);
    expect(campusParts(t).weekday).toBe(6); // Saturday
    expect(t.getTime()).toBeGreaterThan(LATE.getTime());
  });
  it("keeps a time from the last hour on today", () => {
    expect(campusParts(resolveTime("08:30", MORNING)).day).toBe(24);
  });
  it("rejects garbage", () => {
    expect(() => resolveTime("soon", MORNING)).toThrow();
  });
});

describe("nextClassToday", () => {
  const classes = [
    { building: "Tillett Hall", days: [2, 4], start: "10:20" },
    { building: "Beck Hall", days: [2], start: "14:00" },
    { building: "Lucy Stone Hall", days: [1], start: "09:30" },
  ];
  it("picks the next class meeting today", () => {
    expect(nextClassToday(classes, MORNING)?.building).toBe("Tillett Hall");
  });
  it("returns null when nothing is left today", () => {
    expect(nextClassToday(classes, new Date("2026-11-24T21:00:00Z"))).toBeNull();
  });
});
