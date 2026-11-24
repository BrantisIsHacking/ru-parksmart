import { trustScore } from "@/lib/reports/trust";
import { errorResponse, HttpError, reporterFrom } from "@/lib/server/identity";
import { logEvent } from "@/lib/server/metrics";
import { getStore } from "@/lib/server/store";
import type { OutcomeValue } from "@/lib/types";

export const runtime = "nodejs";

const ANSWER_WINDOW_MS = 12 * 60 * 60_000;
const VALUES: OutcomeValue[] = ["easy", "circled", "full"];

/** "Did you find a spot?": { tripId, value } -> { ok: true }. Once, by the trip's own reporter. */
export async function POST(req: Request) {
  try {
    const reporter = await reporterFrom(req);
    const { tripId, value } = (await req.json()) as { tripId?: string; value?: OutcomeValue };
    if (typeof tripId !== "string" || !tripId || tripId.includes("/")) throw new HttpError(400, "tripId required");
    if (!value || !VALUES.includes(value)) throw new HttpError(400, "value must be easy, circled or full");

    const store = getStore();
    const trip = await store.getTrip(tripId);
    if (!trip) throw new HttpError(404, "Trip not found");
    if (trip.reporter !== reporter) throw new HttpError(403, "Not your trip");
    if (trip.state === "answered" || trip.state === "expired") throw new HttpError(409, "This trip was already closed");

    const now = new Date();
    // The question is about arriving at parkBy; an answer before then cannot describe it.
    if (now.getTime() < new Date(trip.parkBy).getTime()) throw new HttpError(400, "Too early to answer");
    if (now.getTime() > new Date(trip.parkBy).getTime() + ANSWER_WINDOW_MS) {
      await store.updateTrip(tripId, { state: "expired", push: null });
      throw new HttpError(410, "This check-in has expired");
    }

    const trust = trustScore((await store.getTrust([reporter])).get(reporter));
    const stored = await store.addOutcome({
      tripId,
      reporter,
      lotId: trip.lotId,
      value,
      at: now.toISOString(),
      parkBy: trip.parkBy,
      predictedStatus: trip.predictedStatus,
      trust,
      createdAt: now.toISOString(),
    });
    if (!stored) throw new HttpError(409, "This trip was already answered");
    await store.updateTrip(tripId, { state: "answered", push: null });
    await logEvent("trip_outcome", reporter, { value, predictedStatus: trip.predictedStatus }, trip.lotId);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
