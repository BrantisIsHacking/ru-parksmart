import { lotById } from "@/lib/data";
import { MATCH_WINDOW_MIN, scoreReports } from "@/lib/reports/trust";
import { errorResponse, HttpError, requirePilotToken } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";

/**
 * Team manual count (ground truth): { lotId, occupied, capacity?, countedAt?, counter? }.
 * Also re-scores nearby student reports to update reporter reliability.
 */
export async function POST(req: Request) {
  try {
    requirePilotToken(req);
    const body = (await req.json()) as { lotId?: string; occupied?: number; capacity?: number; countedAt?: string; counter?: string };
    const lot = body.lotId ? lotById(body.lotId) : undefined;
    if (!lot) throw new HttpError(400, "Unknown lot");
    const occupied = Number(body.occupied);
    const capacity = Number(body.capacity ?? lot.capacity);
    if (!Number.isFinite(occupied) || occupied < 0 || !Number.isFinite(capacity) || capacity <= 0) {
      throw new HttpError(400, "occupied and capacity must be non-negative numbers");
    }
    const countedAt = body.countedAt ? new Date(body.countedAt) : new Date();
    if (Number.isNaN(countedAt.getTime())) throw new HttpError(400, "Bad countedAt");
    const count = {
      lotId: lot.id,
      occupied: Math.min(occupied, capacity),
      capacity,
      countedAt: countedAt.toISOString(),
      counter: (body.counter ?? "team").slice(0, 32),
    };

    const store = getStore();
    await store.addCount(count);

    const since = new Date(countedAt.getTime() - MATCH_WINDOW_MIN * 60_000).toISOString();
    const nearby = (await store.reportsSince(since)).filter(
      (r) => new Date(r.createdAt).getTime() <= countedAt.getTime() + MATCH_WINDOW_MIN * 60_000,
    );
    const current = await store.getTrust(nearby.map((r) => r.reporter));
    const updated = scoreReports(nearby, count, current);
    if (updated.length) await store.putTrust(updated);

    return Response.json({ ok: true, count, reportersScored: updated.length });
  } catch (e) {
    return errorResponse(e);
  }
}
