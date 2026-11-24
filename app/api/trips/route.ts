import { lotById } from "@/lib/data";
import { errorResponse, HttpError, reporterFrom } from "@/lib/server/identity";
import { isAllowedPushEndpoint } from "@/lib/server/pushEndpoint";
import { rateLimit } from "@/lib/server/rateLimit";
import { estimatesFor } from "@/lib/server/services";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";

const NOTIFY_DELAY_MIN = 5;

function validPush(p: unknown): p is PushSubscriptionJSON & { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!p || typeof p !== "object") return false;
  const { endpoint, keys } = p as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  return (
    isAllowedPushEndpoint(endpoint) &&
    typeof keys?.p256dh === "string" &&
    typeof keys.auth === "string"
  );
}

/** "I'm going to Lot X": { lotId, parkBy: ISO, push?: PushSubscriptionJSON } -> { tripId }. */
export async function POST(req: Request) {
  try {
    const reporter = await reporterFrom(req);
    rateLimit(`trips:${reporter}`, 10, 10 * 60_000);
    const body = (await req.json()) as { lotId?: string; parkBy?: string; push?: unknown };
    const lot = body.lotId ? lotById(body.lotId) : undefined;
    if (!lot) throw new HttpError(400, "Unknown lot");
    const parkBy = typeof body.parkBy === "string" ? new Date(body.parkBy) : null;
    if (!parkBy || Number.isNaN(parkBy.getTime())) throw new HttpError(400, "parkBy must be an ISO time");
    const now = new Date();
    if (parkBy.getTime() > now.getTime() + 24 * 60 * 60_000 || parkBy.getTime() < now.getTime() - 60 * 60_000) {
      throw new HttpError(400, "parkBy must be within the next 24 hours or the last hour");
    }
    let push: PushSubscriptionJSON | null = null;
    if (body.push !== undefined && body.push !== null) {
      if (!validPush(body.push)) throw new HttpError(400, "Invalid push subscription");
      const { endpoint, expirationTime, keys } = body.push;
      push = { endpoint, expirationTime: expirationTime ?? null, keys: { p256dh: keys.p256dh, auth: keys.auth } };
    }

    const store = getStore();
    const estimate = (await estimatesFor(parkBy, now)).get(lot.id);
    // One question per student at a time: the new trip replaces any earlier pending one.
    for (const old of await store.pendingTripsFor(reporter)) {
      if (old.id) await store.updateTrip(old.id, { state: "expired", push: null });
    }
    const tripId = await store.addTrip({
      reporter,
      lotId: lot.id,
      parkBy: parkBy.toISOString(),
      notifyAt: new Date(parkBy.getTime() + NOTIFY_DELAY_MIN * 60_000).toISOString(),
      predictedStatus: estimate?.status ?? "gray",
      predictedFill: estimate?.fill ?? null,
      push,
      state: "pending",
      createdAt: now.toISOString(),
    });
    return Response.json({ tripId });
  } catch (e) {
    return errorResponse(e);
  }
}
