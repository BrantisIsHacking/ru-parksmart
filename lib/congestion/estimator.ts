// Congestion estimator. Fuses up to three evidence layers into a status with
// an honest confidence and a list of where the estimate came from:
//   1. historical baseline (typical weekday fill curve per lot)
//   2. class-wave prior (demand spikes before class blocks)
//   3. trust-weighted student reports (decayed by age)
// It never outputs a count of open spaces.
import { BASELINES, type LotBaseline } from "../data";
import type { EvidenceSource, Lot, LotEstimate, LotStatus, ManualCount, OutcomeValue, Report, TripOutcome } from "../types";
import { campusParts } from "../time";
import { classWavePressure } from "./classWave";

export const GREEN_BELOW = 0.7;
export const RED_AT = 0.88;
/** Below this confidence the lot shows Gray ("not enough data"). */
export const MIN_CONFIDENCE = 0.2;
/** Reports older than this (relative to the arrival time) are ignored. */
export const REPORT_MAX_AGE_MIN = 60;
export const REPORT_HALF_LIFE_MIN = 20;
/** A team count is ground truth: heavy weight, decaying with age. */
export const COUNT_WEIGHT = 3;
export const COUNT_HALF_LIFE_MIN = 30;
export const COUNT_MAX_AGE_MIN = 90;
/** A trip check-in is tied to a real arrival: the fill implied by each answer. */
export const OUTCOME_FILL: Record<OutcomeValue, number> = { easy: 0.55, circled: 0.85, full: 0.97 };
export const OUTCOME_WEIGHT = 1;
/** Trust assumed for outcomes stored before trust was recorded (a new reporter's score). */
export const DEFAULT_OUTCOME_TRUST = 0.5;
export const OUTCOME_MAX_AGE_MIN = 60;

const BASELINE_WEIGHT: Record<LotBaseline["source"], number> = {
  placeholder: 0.3,
  manual: 0.8,
  rts: 1.0,
  learned: 0.3,
};
const CLASS_WAVE_ONLY_WEIGHT = 0.25;
/** How far (in fill fraction) the class wave can nudge a baseline. */
const WAVE_NUDGE = 0.12;
const REPORT_FILL: Record<Report["value"], number> = { crowded: 0.95, spaces_open: 0.55 };

/** Interpolated weekday baseline at campus-local minutes; nearest value outside the curve. */
export function baselineFill(baseline: LotBaseline, minutes: number): number {
  const points = Object.entries(baseline.weekday)
    .map(([h, v]) => [Number(h) * 60, v] as const)
    .sort((a, b) => a[0] - b[0]);
  if (!points.length) return NaN;
  if (minutes <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i];
    if (minutes <= t1) {
      const [t0, v0] = points[i - 1];
      return v0 + ((v1 - v0) * (minutes - t0)) / (t1 - t0);
    }
  }
  return points[points.length - 1][1];
}

export function statusForFill(fill: number): Exclude<LotStatus, "gray"> {
  if (fill < GREEN_BELOW) return "green";
  if (fill < RED_AT) return "yellow";
  return "red";
}

export interface EstimateInput {
  lot: Lot;
  /** Arrival time to estimate for. */
  forTime: Date;
  /** Current time; reports after `now` are ignored. */
  now: Date;
  reports: Report[];
  counts?: ManualCount[];
  outcomes?: TripOutcome[];
  baselines?: Record<string, LotBaseline>;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function estimateLot({ lot, forTime, now, reports, counts = [], outcomes = [], baselines = BASELINES }: EstimateInput): LotEstimate {
  const { weekday, minutes } = campusParts(forTime);
  const isWeekday = weekday >= 1 && weekday <= 5;
  const wave = classWavePressure(lot.campus, forTime);
  const parts: { kind: EvidenceSource["kind"]; detail: string; weight: number; value: number; asOf: string | null }[] = [];

  const baseline = baselines[lot.id];
  if (baseline && isWeekday) {
    let value = baselineFill(baseline, minutes);
    let weight = baseline.weight ?? BASELINE_WEIGHT[baseline.source];
    let label =
      baseline.source === "placeholder"
        ? "placeholder curve"
        : baseline.source === "rts"
          ? "Rutgers Transportation Services counts"
          : baseline.source === "learned"
            ? `learned from ${baseline.observations ?? 0} pilot observations`
            : "pilot manual counts";
    if (baseline.source === "learned" && baseline.slotWeight) {
      // Learned confidence is per hour slot: use the slot nearest the arrival time.
      const slot = String(Math.round(minutes / 60));
      const slotWeight = baseline.slotWeight[slot];
      if (slotWeight !== undefined) {
        weight = slotWeight;
        label = `learned from ${baseline.slotObservations?.[slot] ?? 0} pilot observations`;
      } else {
        weight = BASELINE_WEIGHT.placeholder;
        label = "placeholder curve";
      }
    }
    let detail = `Typical weekday fill (${label})`;
    if (wave !== null) {
      value = clamp01(value + WAVE_NUDGE * (wave - 0.5));
      detail += ", adjusted for the class wave";
    }
    parts.push({ kind: "historical_baseline", detail, weight, value, asOf: null });
  } else if (wave !== null && wave > 0) {
    parts.push({
      kind: "class_wave_prior",
      detail: "Expected arrivals before class blocks (public course times)",
      weight: CLASS_WAVE_ONLY_WEIGHT,
      value: clamp01(0.2 + 0.7 * wave),
      asOf: null,
    });
  }

  const usable = reports.filter((r) => {
    const created = new Date(r.createdAt).getTime();
    const ageMin = (forTime.getTime() - created) / 60_000;
    return r.lotId === lot.id && created <= now.getTime() && ageMin >= -5 && ageMin <= REPORT_MAX_AGE_MIN;
  });
  if (usable.length) {
    let w = 0;
    let v = 0;
    let newest = 0;
    for (const r of usable) {
      const created = new Date(r.createdAt).getTime();
      const ageMin = Math.max(0, (forTime.getTime() - created) / 60_000);
      const rw = r.trust * 0.5 ** (ageMin / REPORT_HALF_LIFE_MIN);
      w += rw;
      v += rw * REPORT_FILL[r.value];
      newest = Math.max(newest, created);
    }
    parts.push({
      kind: "student_reports",
      detail: `${usable.length} recent student report${usable.length === 1 ? "" : "s"}, weighted by reporter reliability`,
      weight: w,
      value: v / w,
      asOf: new Date(newest).toISOString(),
    });
  }

  const newestCount = counts
    .filter((c) => {
      const counted = new Date(c.countedAt).getTime();
      const ageMin = (forTime.getTime() - counted) / 60_000;
      return c.lotId === lot.id && counted <= now.getTime() && ageMin >= -5 && ageMin <= COUNT_MAX_AGE_MIN;
    })
    .sort((a, b) => b.countedAt.localeCompare(a.countedAt))[0];
  if (newestCount) {
    const ageMin = Math.max(0, (forTime.getTime() - new Date(newestCount.countedAt).getTime()) / 60_000);
    parts.push({
      kind: "team_count",
      detail: `Team count: ${newestCount.occupied} of ${newestCount.capacity} cars`,
      weight: COUNT_WEIGHT * 0.5 ** (ageMin / COUNT_HALF_LIFE_MIN),
      value: newestCount.occupied / Math.max(1, newestCount.capacity),
      asOf: newestCount.countedAt,
    });
  }

  const usableOutcomes = outcomes.filter((o) => {
    const at = new Date(o.at).getTime();
    const ageMin = (forTime.getTime() - at) / 60_000;
    // Only answers given at or soon after the planned park time describe the lot at that time.
    const sinceParkMin = (at - new Date(o.parkBy).getTime()) / 60_000;
    return (
      o.lotId === lot.id &&
      at <= now.getTime() &&
      sinceParkMin >= 0 &&
      sinceParkMin <= 60 &&
      ageMin >= -5 &&
      ageMin <= OUTCOME_MAX_AGE_MIN
    );
  });
  if (usableOutcomes.length) {
    let w = 0;
    let v = 0;
    let newest = 0;
    for (const o of usableOutcomes) {
      const at = new Date(o.at).getTime();
      const ageMin = Math.max(0, (forTime.getTime() - at) / 60_000);
      // A new reporter (trust 0.5) weighs 1.0, as a check-in is tied to a real arrival.
      const ow = OUTCOME_WEIGHT * 2 * (o.trust ?? DEFAULT_OUTCOME_TRUST) * 0.5 ** (ageMin / REPORT_HALF_LIFE_MIN);
      w += ow;
      v += ow * OUTCOME_FILL[o.value];
      newest = Math.max(newest, at);
    }
    const n = usableOutcomes.length;
    parts.push({
      kind: "trip_outcome",
      detail: `${n} trip check-in${n === 1 ? "" : "s"}`,
      weight: w,
      value: v / w,
      asOf: new Date(newest).toISOString(),
    });
  }

  const total = parts.reduce((s, p) => s + p.weight, 0);
  const confidence = total > 0 ? 1 - Math.exp(-total) : 0;
  const base = { lotId: lot.id, forTime: forTime.toISOString(), computedAt: now.toISOString(), confidence: round2(confidence) };

  if (total === 0 || confidence < MIN_CONFIDENCE) {
    return {
      ...base,
      status: "gray",
      fill: null,
      sources: parts.map((p) => ({ kind: p.kind, detail: p.detail, share: total ? round2(p.weight / total) : 0, asOf: p.asOf })),
    };
  }
  const fill = parts.reduce((s, p) => s + p.value * p.weight, 0) / total;
  return {
    ...base,
    status: statusForFill(fill),
    fill: round2(fill),
    sources: parts.map((p) => ({ kind: p.kind, detail: p.detail, share: round2(p.weight / total), asOf: p.asOf })),
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
