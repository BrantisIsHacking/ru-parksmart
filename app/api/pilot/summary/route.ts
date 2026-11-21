import { summarizePilot } from "@/lib/metrics/analyze";
import { errorResponse, requirePilotToken } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    requirePilotToken(req);
    const store = getStore();
    const [events, reports, counts] = await Promise.all([store.listEvents(), store.listReports(), store.listCounts()]);
    return Response.json({
      storage: store.kind,
      summary: summarizePilot(events, reports, counts),
      recentCounts: counts.slice(-10).reverse(),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
