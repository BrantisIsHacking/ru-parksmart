import "server-only";
// Shared server operations used by both the API routes and Gemini's tools,
// so the assistant and the app UI always give the same answer.
import { COUNT_MAX_AGE_MIN, estimateLot, OUTCOME_MAX_AGE_MIN, REPORT_MAX_AGE_MIN } from "../congestion/estimator";
import { findBuilding, LOTS } from "../data";
import { planTrip, type TripPlan } from "../planner/parkOrRide";
import { campusParts, campusTimeOnDay, parseHHMM } from "../time";
import type { ClassEntry, LotEstimate } from "../types";
import { getBaselines } from "./baselines";
import { getStore } from "./store";

export async function estimatesFor(forTime: Date, now = new Date()): Promise<Map<string, LotEstimate>> {
  const since = new Date(Math.min(forTime.getTime(), now.getTime()) - REPORT_MAX_AGE_MIN * 60_000);
  const countsSince = new Date(Math.min(forTime.getTime(), now.getTime()) - COUNT_MAX_AGE_MIN * 60_000);
  const outcomesSince = new Date(Math.min(forTime.getTime(), now.getTime()) - OUTCOME_MAX_AGE_MIN * 60_000);
  const store = getStore();
  const [reports, counts, outcomes, baselines] = await Promise.all([
    store.reportsSince(since.toISOString()),
    store.countsSince(countsSince.toISOString()),
    store.outcomesSince(outcomesSince.toISOString()),
    getBaselines(),
  ]);
  return new Map(LOTS.map((lot) => [lot.id, estimateLot({ lot, forTime, now, reports, counts, outcomes, baselines })]));
}

/**
 * Accepts "HH:MM" (campus time), "10:30 AM", or an ISO timestamp. Missing → now.
 * A clock time more than an hour in the past means that time tomorrow
 * ("arrive by 11:00" asked at 11 PM is about tomorrow morning).
 */
export function resolveTime(input: string | undefined | null, now = new Date()): Date {
  if (!input) return now;
  const s = input.trim();
  const upcoming = (minutes: number) => {
    const today = campusTimeOnDay(now, minutes);
    return today.getTime() < now.getTime() - 60 * 60_000
      ? campusTimeOnDay(new Date(now.getTime() + 24 * 60 * 60_000), minutes)
      : today;
  };
  const ampm = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(s);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (ampm[3].toLowerCase() === "p") h += 12;
    return upcoming(h * 60 + Number(ampm[2] ?? 0));
  }
  if (/^\d{1,2}:\d{2}$/.test(s)) return upcoming(parseHHMM(s));
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Could not read time "${input}". Use HH:MM (24h) or ISO.`);
  return d;
}

/** Next class today at or after now (campus time), with a small grace period. */
export function nextClassToday(classes: ClassEntry[], now = new Date()): (ClassEntry & { startsAt: Date }) | null {
  const { weekday, minutes } = campusParts(now);
  const upcoming = classes
    .filter((c) => c.days.includes(weekday))
    .map((c) => ({ ...c, startMin: parseHHMM(c.start) }))
    .filter((c) => c.startMin >= minutes - 5)
    .sort((a, b) => a.startMin - b.startMin)[0];
  if (!upcoming) return null;
  const { startMin, ...entry } = upcoming;
  return { ...entry, startsAt: campusTimeOnDay(now, startMin) };
}

export interface Recommendation {
  plan: TripPlan;
  /** When to leave home, if the student gave a commute time. */
  leaveBy: string | null;
}

export async function recommend(opts: {
  permitId: string;
  destination: string;
  arriveBy: Date;
  commuteMin?: number | null;
  now?: Date;
}): Promise<Recommendation> {
  const building = findBuilding(opts.destination);
  if (!building) {
    throw new Error(`Unknown building "${opts.destination}". Pilot buildings: Tillett Hall, Lucy Stone Hall, Beck Hall, Livingston Student Center, Rutgers Business School.`);
  }
  const now = opts.now ?? new Date();
  // Estimate congestion for roughly when the student will be parking.
  const parkingTime = new Date(Math.max(now.getTime(), opts.arriveBy.getTime() - 15 * 60_000));
  const estimates = await estimatesFor(parkingTime, now);
  const plan = planTrip({ permitId: opts.permitId, destination: building, arriveBy: opts.arriveBy, estimates });
  const leaveBy =
    plan.recommended && opts.commuteMin
      ? new Date(new Date(plan.recommended.parkBy).getTime() - opts.commuteMin * 60_000).toISOString()
      : null;
  return { plan, leaveBy };
}
