import "server-only";
// Learned baselines from the last 120 days of team counts and trip check-ins.
// The computed curves live in one Firestore doc (meta/baselines) shared by every
// instance and are recomputed at most every 2 hours; each instance keeps that doc
// in memory for 10 minutes. Falls back to the placeholder curves.
import { learnBaselines } from "../congestion/learnedBaseline";
import { BASELINES, type LotBaseline } from "../data";
import type { BaselineCache } from "../store/types";
import { getStore } from "./store";

const MEMORY_TTL_MS = 10 * 60_000;
const RECOMPUTE_AFTER_MS = 2 * 60 * 60_000;
const FAILURE_TTL_MS = 5 * 60_000;
const WINDOW_DAYS = 120;

type Lots = Record<string, LotBaseline>;
const g = globalThis as unknown as {
  __parksmartBaselines?: { until: number; value: Lots };
  __parksmartBaselinesInFlight?: Promise<Lots> | null;
};

function fresh(doc: BaselineCache | null, now: number): doc is BaselineCache {
  return Boolean(doc && now - Date.parse(doc.computedAt) < RECOMPUTE_AFTER_MS);
}

/** Fresh curves, or on error the last good curves cached for only FAILURE_TTL_MS. */
async function load(): Promise<{ value: Lots; ttl: number }> {
  const store = getStore();
  const now = Date.now();
  let doc: BaselineCache | null = null;
  try {
    doc = await store.getBaselineCache();
    if (fresh(doc, now)) return { value: doc.lots, ttl: MEMORY_TTL_MS };
    const since = new Date(now - WINDOW_DAYS * 24 * 60 * 60_000).toISOString();
    const [counts, outcomes] = await Promise.all([store.countsSince(since), store.outcomesSince(since)]);
    const lots = learnBaselines(BASELINES, counts, outcomes);
    try {
      await store.putBaselineCache({ computedAt: new Date(now).toISOString(), lots });
    } catch (e) {
      console.error("Could not save learned baselines (serving them anyway)", e);
    }
    return { value: lots, ttl: MEMORY_TTL_MS };
  } catch (e) {
    console.error("Could not load learned baselines; serving the last good curves", e);
    // Cache the fallback briefly so failing requests don't hammer Firestore.
    return { value: g.__parksmartBaselines?.value ?? doc?.lots ?? BASELINES, ttl: FAILURE_TTL_MS };
  }
}

export async function getBaselines(): Promise<Lots> {
  const cached = g.__parksmartBaselines;
  if (cached && Date.now() < cached.until) return cached.value;
  if (!g.__parksmartBaselinesInFlight) {
    g.__parksmartBaselinesInFlight = load()
      .then(({ value, ttl }) => {
        g.__parksmartBaselines = { until: Date.now() + ttl, value };
        return value;
      })
      .finally(() => {
        g.__parksmartBaselinesInFlight = null;
      });
  }
  return g.__parksmartBaselinesInFlight;
}
