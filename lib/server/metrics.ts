import "server-only";
import type { MetricEvent } from "../types";
import { getStore } from "./store";

/** Fire-and-forget metric logging; never fails the user's request. */
export async function logEvent(
  type: MetricEvent["type"],
  reporter: string,
  props?: MetricEvent["props"],
  lotId?: string | null,
) {
  try {
    await getStore().addEvent({ type, reporter, lotId: lotId ?? null, props: props ?? {}, createdAt: new Date().toISOString() });
  } catch (e) {
    console.error("[metrics] failed to log", type, e);
  }
}
