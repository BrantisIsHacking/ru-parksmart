import { ACTIVE_RULES, LOTS } from "@/lib/data";
import { checkPermit } from "@/lib/rules/engine";
import { errorResponse } from "@/lib/server/identity";
import { estimatesFor, resolveTime } from "@/lib/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public: congestion estimates for every lot at ?time= (default now).
 * With ?permit=, each row also says whether that permit may park there at that time.
 */
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const forTime = resolveTime(params.get("time"));
    const permit = params.get("permit");
    const estimates = await estimatesFor(forTime);
    return Response.json({
      forTime: forTime.toISOString(),
      lots: LOTS.map((lot) => ({
        lot,
        estimate: estimates.get(lot.id),
        ...(permit ? { allowed: checkPermit(ACTIVE_RULES, lot.id, permit, forTime).allowed } : {}),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
