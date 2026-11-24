import { COUNT_MAX_AGE_MIN, estimateLot, OUTCOME_MAX_AGE_MIN } from "@/lib/congestion/estimator";
import { lotById } from "@/lib/data";
import { canReport, REPORT_WINDOW_MIN, trustScore } from "@/lib/reports/trust";
import { errorResponse, HttpError, reporterFrom } from "@/lib/server/identity";
import { getBaselines } from "@/lib/server/baselines";
import { logEvent } from "@/lib/server/metrics";
import { getStore } from "@/lib/server/store";
import type { ReportValue } from "@/lib/types";

export const runtime = "nodejs";

/** One-tap report: { lotId, value: "crowded" | "spaces_open" }. */
export async function POST(req: Request) {
  try {
    const reporter = await reporterFrom(req);
    const { lotId, value } = (await req.json()) as { lotId?: string; value?: ReportValue };
    const lot = lotId ? lotById(lotId) : undefined;
    if (!lot) throw new HttpError(400, "Unknown lot");
    if (value !== "crowded" && value !== "spaces_open") throw new HttpError(400, "value must be crowded or spaces_open");

    const store = getStore();
    const now = new Date();
    if (!canReport(await store.lastReportAt(reporter, lot.id), now)) {
      throw new HttpError(429, `You already reported ${lot.name} in the last ${REPORT_WINDOW_MIN} minutes.`);
    }
    const trust = trustScore((await store.getTrust([reporter])).get(reporter));
    await store.addReport({ lotId: lot.id, value, reporter, trust, createdAt: now.toISOString() });
    await logEvent("report", reporter, { value }, lot.id);

    const since = new Date(now.getTime() - 60 * 60_000).toISOString();
    const countsSince = new Date(now.getTime() - COUNT_MAX_AGE_MIN * 60_000).toISOString();
    const outcomesSince = new Date(now.getTime() - OUTCOME_MAX_AGE_MIN * 60_000).toISOString();
    const [reports, counts, outcomes, baselines] = await Promise.all([
      store.reportsSince(since),
      store.countsSince(countsSince),
      store.outcomesSince(outcomesSince),
      getBaselines(),
    ]);
    const estimate = estimateLot({ lot, forTime: now, now, reports, counts, outcomes, baselines });
    return Response.json({ ok: true, estimate });
  } catch (e) {
    return errorResponse(e);
  }
}
