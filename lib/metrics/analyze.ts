// Pilot analytics for the case study's "Measurable Impact" section.
// Pure functions over exported data, so the same numbers can be recomputed
// from the CSV exports for verification.
import { estimateLot, statusForFill } from "../congestion/estimator";
import { lotById } from "../data";
import { reportAgrees, reportsMatchingCount } from "../reports/trust";
import type { LotStatus, ManualCount, MetricEvent, Report, TripOutcome } from "../types";

export interface PilotSummary {
  participants: number;
  appOpens: number;
  decisions: { count: number; medianSeconds: number | null; p75Seconds: number | null };
  parkOrRide: { shown: number; followed: number; uptake: number | null };
  satisfaction: { responses: number; average: number | null };
  reports: { count: number; reporters: number };
  prediction: {
    evaluated: number;
    /** Share of manual counts where the predicted status (excluding Gray) matched observed. */
    accuracy: number | null;
    grayShare: number | null;
    confusion: Record<"green" | "yellow" | "red", Record<LotStatus, number>>;
  };
  reportReliability: { matched: number; agreementRate: number | null };
  /** Trip check-ins: share of answers where the shown prediction matched (gray predictions excluded). */
  checkins: { count: number; accuracy: number | null };
  chatMessages: number;
  scheduleImports: number;
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const round1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);
const round3 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);

/**
 * Replays each manual count: what would the app have shown for that lot at that
 * moment, using only reports submitted before the count?
 */
export function evaluatePredictions(counts: ManualCount[], reports: Report[]) {
  const emptyRow = (): Record<LotStatus, number> => ({ green: 0, yellow: 0, red: 0, gray: 0 });
  const confusion = { green: emptyRow(), yellow: emptyRow(), red: emptyRow() };
  let correct = 0;
  let gray = 0;
  let evaluated = 0;
  for (const c of counts) {
    const lot = lotById(c.lotId);
    if (!lot) continue;
    const t = new Date(c.countedAt);
    const prior = reports.filter((r) => new Date(r.createdAt) < t);
    // Intentionally placeholder baselines and no counts, so the evaluation is not circular.
    const predicted = estimateLot({ lot, forTime: t, now: t, reports: prior }).status;
    const observed = statusForFill(c.occupied / Math.max(1, c.capacity));
    confusion[observed][predicted]++;
    evaluated++;
    if (predicted === "gray") gray++;
    else if (predicted === observed) correct++;
  }
  const nonGray = evaluated - gray;
  return {
    evaluated,
    accuracy: nonGray ? round3(correct / nonGray) : null,
    grayShare: evaluated ? round3(gray / evaluated) : null,
    confusion,
  };
}

export function summarizePilot(
  events: MetricEvent[],
  reports: Report[],
  counts: ManualCount[],
  outcomes: TripOutcome[] = [],
): PilotSummary {
  const of = (type: MetricEvent["type"]) => events.filter((e) => e.type === type);
  const decisionSecs = of("decision")
    .map((e) => Number(e.props?.decisionMs) / 1000)
    .filter((x) => Number.isFinite(x) && x > 0 && x < 30 * 60);
  const ratings = of("satisfaction")
    .map((e) => Number(e.props?.rating))
    .filter((x) => x >= 1 && x <= 5);
  const shown = of("parkorride_shown").length;
  const followed = of("parkorride_followed").length;

  let matched = 0;
  let agreed = 0;
  for (const c of counts) {
    const fill = c.occupied / Math.max(1, c.capacity);
    for (const r of reportsMatchingCount(reports, c)) {
      matched++;
      if (reportAgrees(r.value, fill)) agreed++;
    }
  }

  const expected = { easy: "green", circled: "yellow", full: "red" } as const;
  const scored = outcomes.filter((o) => o.predictedStatus !== "gray");
  const checkinMatches = scored.filter((o) => expected[o.value] === o.predictedStatus).length;

  return {
    participants: new Set(events.map((e) => e.reporter)).size,
    appOpens: of("app_open").length,
    decisions: {
      count: decisionSecs.length,
      medianSeconds: round1(quantile(decisionSecs, 0.5)),
      p75Seconds: round1(quantile(decisionSecs, 0.75)),
    },
    parkOrRide: { shown, followed, uptake: shown ? round3(followed / shown) : null },
    satisfaction: {
      responses: ratings.length,
      average: ratings.length ? round1(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
    },
    reports: { count: reports.length, reporters: new Set(reports.map((r) => r.reporter)).size },
    prediction: evaluatePredictions(counts, reports),
    reportReliability: { matched, agreementRate: matched ? round3(agreed / matched) : null },
    checkins: { count: outcomes.length, accuracy: scored.length ? round3(checkinMatches / scored.length) : null },
    chatMessages: of("chat_message").length,
    scheduleImports: of("schedule_import").length,
  };
}

/** RFC 4180 CSV. Nested `props` are flattened to props.<key> columns. */
export function toCsv(rows: object[]): string {
  const flat = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [pk, pv] of Object.entries(v)) out[`${k}.${pk}`] = pv;
      } else out[k] = v;
    }
    return out;
  });
  const cols = [...new Set(flat.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...flat.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
