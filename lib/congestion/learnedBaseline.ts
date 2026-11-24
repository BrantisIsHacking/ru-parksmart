// Learns the typical weekday fill curve per lot from pilot observations
// (team counts and trip check-ins), blending them into the placeholder curve.
// Pure function: no I/O.
import type { LotBaseline } from "../data";
import { campusParts } from "../time";
import type { ManualCount, TripOutcome } from "../types";
import { DEFAULT_OUTCOME_TRUST, OUTCOME_FILL } from "./estimator";

/** Placeholder points count as this much weight when blending. */
const PRIOR_WEIGHT = 2;
const COUNT_OBS_WEIGHT = 1;
/** Learned weight for an hour slot with summed observation weight n: 0.3 + 0.5 * n / (n + 5). */
const SLOT_BASE_WEIGHT = 0.3;
const SLOT_GAIN = 0.5;
const SLOT_HALF_N = 5;

interface Observation {
  lotId: string;
  at: string;
  fill: number;
  weight: number;
}

export function learnBaselines(
  placeholder: Record<string, LotBaseline>,
  counts: ManualCount[],
  outcomes: TripOutcome[],
): Record<string, LotBaseline> {
  const observations: Observation[] = [
    ...counts.map((c) => ({
      lotId: c.lotId,
      at: c.countedAt,
      fill: c.occupied / Math.max(1, c.capacity),
      weight: COUNT_OBS_WEIGHT,
    })),
    // The student was at the lot at parkBy, not when they answered. A check-in weighs the
    // reporter's trust at answer time (a new reporter: 0.5).
    ...outcomes.map((o) => ({
      lotId: o.lotId,
      at: o.parkBy,
      fill: OUTCOME_FILL[o.value],
      weight: o.trust ?? DEFAULT_OUTCOME_TRUST,
    })),
  ];

  const result: Record<string, LotBaseline> = {};
  for (const [lotId, baseline] of Object.entries(placeholder)) {
    // Sum of weight*fill, weight and observation count per curve hour key (nearest hour).
    const byHour = new Map<string, { wf: number; w: number; n: number }>();
    let count = 0;
    for (const o of observations) {
      if (o.lotId !== lotId) continue;
      const { weekday, minutes } = campusParts(new Date(o.at));
      if (weekday < 1 || weekday > 5) continue;
      const key = String(Math.round(minutes / 60));
      if (!(key in baseline.weekday)) continue;
      const acc = byHour.get(key) ?? { wf: 0, w: 0, n: 0 };
      acc.wf += o.weight * o.fill;
      acc.w += o.weight;
      acc.n++;
      byHour.set(key, acc);
      count++;
    }
    if (!byHour.size) {
      result[lotId] = baseline;
      continue;
    }
    const weekday: Record<string, number> = { ...baseline.weekday };
    const slotWeight: Record<string, number> = {};
    const slotObservations: Record<string, number> = {};
    for (const [key, { wf, w, n }] of byHour) {
      weekday[key] = (baseline.weekday[key] * PRIOR_WEIGHT + wf) / (PRIOR_WEIGHT + w);
      slotWeight[key] = SLOT_BASE_WEIGHT + (SLOT_GAIN * w) / (w + SLOT_HALF_N);
      slotObservations[key] = n;
    }
    result[lotId] = { source: "learned", weekday, observations: count, slotWeight, slotObservations };
  }
  return result;
}
