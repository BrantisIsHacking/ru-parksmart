// Trust-weighted reporting (after Kpark, UCF 2015). Each anonymous reporter's
// reliability is how often their reports agreed with independent evidence
// (team manual counts). Reliable reporters count for more.
import type { ManualCount, Report, ReportValue, TrustRecord } from "../types";

export const MIN_TRUST = 0.2;
export const MAX_TRUST = 1;
/** A lot counts as "crowded" when at least this fraction is occupied. */
export const CROWDED_THRESHOLD = 0.85;
/** One report per reporter per lot per window. */
export const REPORT_WINDOW_MIN = 15;
/** Reports this close to a manual count are scored against it. */
export const MATCH_WINDOW_MIN = 20;

/** Laplace-smoothed agreement rate; a new reporter starts at 0.5. */
export function trustScore(rec?: TrustRecord | null): number {
  const agree = rec?.agree ?? 0;
  const disagree = rec?.disagree ?? 0;
  const raw = (1 + agree) / (2 + agree + disagree);
  return Math.min(MAX_TRUST, Math.max(MIN_TRUST, raw));
}

export function reportAgrees(value: ReportValue, observedFill: number): boolean {
  return value === "crowded" ? observedFill >= CROWDED_THRESHOLD : observedFill < CROWDED_THRESHOLD;
}

export function canReport(lastReportAt: string | null | undefined, now: Date): boolean {
  if (!lastReportAt) return true;
  return now.getTime() - new Date(lastReportAt).getTime() >= REPORT_WINDOW_MIN * 60_000;
}

/** Reports that a manual count can score: same lot, within ±MATCH_WINDOW_MIN. */
export function reportsMatchingCount(reports: Report[], count: ManualCount): Report[] {
  const t = new Date(count.countedAt).getTime();
  return reports.filter(
    (r) =>
      r.lotId === count.lotId &&
      Math.abs(new Date(r.createdAt).getTime() - t) <= MATCH_WINDOW_MIN * 60_000,
  );
}

/** New trust records after scoring `reports` against a manual count. */
export function scoreReports(
  reports: Report[],
  count: ManualCount,
  current: Map<string, TrustRecord>,
): TrustRecord[] {
  const fill = count.occupied / Math.max(1, count.capacity);
  const updated = new Map<string, TrustRecord>();
  for (const r of reportsMatchingCount(reports, count)) {
    const rec = updated.get(r.reporter) ??
      current.get(r.reporter) ?? { reporter: r.reporter, agree: 0, disagree: 0 };
    const next = reportAgrees(r.value, fill)
      ? { ...rec, agree: rec.agree + 1 }
      : { ...rec, disagree: rec.disagree + 1 };
    updated.set(r.reporter, next);
  }
  return [...updated.values()];
}
