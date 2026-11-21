import { LOTS } from "@/lib/data";
import { errorResponse } from "@/lib/server/identity";
import { estimatesFor, resolveTime } from "@/lib/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: congestion estimates for every pilot lot at ?time= (default now). */
export async function GET(req: Request) {
  try {
    const time = new URL(req.url).searchParams.get("time");
    const forTime = resolveTime(time);
    const estimates = await estimatesFor(forTime);
    return Response.json({
      forTime: forTime.toISOString(),
      lots: LOTS.map((lot) => ({ lot, estimate: estimates.get(lot.id) })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
