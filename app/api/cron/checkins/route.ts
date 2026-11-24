import { timingSafeEqual } from "node:crypto";
import { lotById } from "@/lib/data";
import { errorResponse, HttpError } from "@/lib/server/identity";
import { configurePush, sendCheckin } from "@/lib/server/push";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPIRE_AFTER_MS = 12 * 60 * 60_000;
/** Matches the notification TTL (3600 s): after this, a late question is pointless. */
const RETRY_FOR_MS = 60 * 60_000;

function authorized(header: string | null, secret: string): boolean {
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called every minute by an external cron. One Firestore query per run (pending trips):
 * expires trips past their window, then sends due check-ins.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new HttpError(503, "Cron is not configured");
    if (!authorized(req.headers.get("authorization"), secret)) throw new HttpError(401, "Unauthorized");
    try {
      configurePush();
    } catch (e) {
      console.error("Push is not configured", e);
      throw new HttpError(503, "Push is not configured");
    }

    const store = getStore();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const staleBefore = new Date(now - EXPIRE_AFTER_MS).toISOString();
    const result = { sent: 0, gone: 0, failed: 0, retrying: 0, expired: 0 };

    // Notified trips are never re-read: their push is already null, and the outcomes
    // route turns away answers after 12 h on its own.
    const pending = await store.pendingTrips();

    // Expire first, so a trip past its window is never notified.
    for (const trip of pending) {
      if (!trip.id || trip.parkBy >= staleBefore) continue;
      try {
        await store.updateTrip(trip.id, { state: "expired", push: null });
        result.expired++;
      } catch {
        result.failed++;
      }
    }

    for (const trip of pending) {
      if (!trip.id || trip.parkBy < staleBefore || trip.notifyAt > nowIso) continue;
      try {
        // Atomic claim: only one overlapping run gets to notify this trip.
        if (!(await store.claimTrip(trip.id))) continue;
        if (!trip.push) continue;
        const outcome = await sendCheckin(trip.push, {
          tripId: trip.id,
          lotName: lotById(trip.lotId)?.name ?? "your lot",
        });
        if (outcome === "retry" && now < Date.parse(trip.notifyAt) + RETRY_FOR_MS) {
          // Transient: put it back (only if still notified) so the next run retries.
          await store.releaseTrip(trip.id);
          result.retrying++;
          continue;
        }
        // Sent, gone, permanent failure, or out of retry time: the address is no longer needed.
        await store.updateTrip(trip.id, { push: null });
        if (outcome === "retry") result.failed++;
        else result[outcome]++;
      } catch {
        result.failed++;
      }
    }
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
