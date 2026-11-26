import { errorResponse, HttpError, reporterFrom } from "@/lib/server/identity";
import { logEvent } from "@/lib/server/metrics";
import { nextClassToday, recommend, resolveTime } from "@/lib/server/services";
import type { ClassEntry } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Home-screen recommendation. Body: { permitId, classes?, destination?, arriveBy?, commuteMin? }.
 * Uses the next class today when destination/arriveBy are not given.
 */
export async function POST(req: Request) {
  try {
    const reporter = await reporterFrom(req);
    const body = (await req.json()) as {
      permitId?: string;
      classes?: ClassEntry[];
      destination?: string;
      /** A point picked on the map: { lat, lng, label? }. Takes precedence over destination. */
      destinationPoint?: { lat?: unknown; lng?: unknown; label?: unknown };
      arriveBy?: string;
      commuteMin?: number;
    };
    const p = body.destinationPoint;
    const destinationPoint =
      p && typeof p.lat === "number" && typeof p.lng === "number"
        ? { lat: p.lat, lng: p.lng, label: typeof p.label === "string" ? p.label : undefined }
        : null;
    if (!body.permitId) throw new HttpError(400, "permitId is required");
    const now = new Date();
    let destination = body.destination;
    let arriveBy: Date | null = body.arriveBy ? resolveTime(body.arriveBy, now) : null;
    let nextClass: (ClassEntry & { startsAt: string }) | null = null;

    if ((!destination && !destinationPoint) || !arriveBy) {
      const next = nextClassToday(Array.isArray(body.classes) ? body.classes : [], now);
      if (!next) return Response.json({ nextClass: null, plan: null, leaveBy: null });
      nextClass = { ...next, startsAt: next.startsAt.toISOString() };
      // The resolved campus-map building beats re-matching the name.
      destination = next.buildingId || next.building;
      // Aim to reach the building 2 minutes before class starts.
      arriveBy = new Date(next.startsAt.getTime() - 2 * 60_000);
    }

    let result;
    try {
      result = await recommend({
        permitId: body.permitId,
        destination,
        destinationPoint: nextClass ? null : destinationPoint,
        arriveBy,
        commuteMin: body.commuteMin,
        now,
      });
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    if (result.plan.parkAndRide) {
      await logEvent("parkorride_shown", reporter, { via: "home", recommended: result.plan.recommended?.lotId ?? null }, result.plan.usual?.lotId);
    }
    return Response.json({ nextClass, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}
