import { toCsv } from "@/lib/metrics/analyze";
import { errorResponse, HttpError, requirePilotToken } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CSV export for the case-study analysis: ?kind=events|reports|counts|outcomes */
export async function GET(req: Request) {
  try {
    requirePilotToken(req);
    const kind = new URL(req.url).searchParams.get("kind");
    const store = getStore();
    const rows =
      kind === "events" ? await store.listEvents()
      : kind === "reports" ? await store.listReports()
      : kind === "counts" ? await store.listCounts()
      : kind === "outcomes" ? await store.listOutcomes()
      : null;
    if (!rows) throw new HttpError(400, "kind must be events, reports, counts or outcomes");
    return new Response(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="ru-parksmart-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
