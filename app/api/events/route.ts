import { lotById } from "@/lib/data";
import { errorResponse, HttpError, reporterFrom } from "@/lib/server/identity";
import { logEvent } from "@/lib/server/metrics";
import { rateLimit } from "@/lib/server/rateLimit";
import type { MetricEvent } from "@/lib/types";

export const runtime = "nodejs";

// Only these client-side events are accepted, each with a fixed set of props.
const ALLOWED: Partial<Record<MetricEvent["type"], string[]>> = {
  app_open: [],
  decision: ["decisionMs", "followedRecommendation", "mode"],
  parkorride_followed: ["mode"],
  satisfaction: ["rating"],
};

export async function POST(req: Request) {
  try {
    const reporter = await reporterFrom(req);
    rateLimit(`events:${reporter}`, 60, 60_000);
    const body = (await req.json()) as { type?: MetricEvent["type"]; lotId?: string; props?: Record<string, unknown> };
    const keys = body.type ? ALLOWED[body.type] : undefined;
    if (!body.type || !keys) throw new HttpError(400, "Unsupported event type");
    const props: NonNullable<MetricEvent["props"]> = {};
    for (const k of keys) {
      const v = body.props?.[k];
      if (typeof v === "number" || typeof v === "boolean") props[k] = v;
      else if (typeof v === "string") props[k] = v.slice(0, 32);
    }
    if (body.type === "satisfaction") {
      const r = Number(props.rating);
      if (!(r >= 1 && r <= 5)) throw new HttpError(400, "rating must be 1-5");
    }
    const lotId = body.lotId && lotById(body.lotId) ? body.lotId : null;
    await logEvent(body.type, reporter, props, lotId);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
