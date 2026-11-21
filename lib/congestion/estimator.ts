// Congestion estimator. Fuses up to three evidence layers into a status with
// an honest confidence and a list of where the estimate came from:
//   1. historical baseline (typical weekday fill curve per lot)
//   2. class-wave prior (demand spikes before class blocks)
//   3. trust-weighted student reports (decayed by age)
// It never outputs a count of open spaces.
import { BASELINES, type LotBaseline } from "../data";
import type { EvidenceSource, Lot, LotEstimate, LotStatus, Report } from "../types";
import { campusParts } from "../time";
import { classWavePressure } from "./classWave";

export const GREEN_BELOW = 0.7;
export const RED_AT = 0.88;
/** Below this confidence the lot shows Gray ("not enough data"). */
export const MIN_CONFIDENCE = 0.2;
/** Reports older than this (relative to the arrival time) are ignored. */
export const REPORT_MAX_AGE_MIN = 60;
export const REPORT_HALF_LIFE_MIN = 20;

const BASELINE_WEIGHT: Record<LotBaseline["source"], number> = {
  placeholder: 0.3,
  manual: 0.8,
  rts: 1.0,
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
  baselines?: Record<string, LotBaseline>;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function estimateLot({ lot, forTime, now, reports, baselines = BASELINES }: EstimateInput): LotEstimate {
  const { weekday, minutes } = campusParts(forTime);
  const isWeekday = weekday >= 1 && weekday <= 5;
  const wave = classWavePressure(lot.campus, forTime);
  const parts: { kind: EvidenceSource["kind"]; detail: string; weight: number; value: number; asOf: string | null }[] = [];

  const baseline = baselines[lot.id];
  if (baseline && isWeekday) {
    let value = baselineFill(baseline, minutes);
    let detail = `Typical weekday fill (${baseline.source === "placeholder" ? "placeholder curve" : baseline.source === "rts" ? "Rutgers Transportation Services counts" : "pilot manual counts"})`;
    if (wave !== null) {
      value = clamp01(value + WAVE_NUDGE * (wave - 0.5));
      detail += ", adjusted for the class wave";
    }
    parts.push({ kind: "historical_baseline", detail, weight: BASELINE_WEIGHT[baseline.source], value, asOf: null });
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
