import "server-only";
import { HttpError } from "./identity";

// Per-instance sliding window, to protect the Gemini quota during the pilot.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new HttpError(429, "Too many requests — try again in a minute.");
  recent.push(now);
  hits.set(key, recent);
}
